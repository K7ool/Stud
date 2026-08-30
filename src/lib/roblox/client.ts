/**
 * Roblox Studio communication — pair-based WebSocket relay.
 *
 * The Roblox plugin does NOT connect to the website directly. Instead:
 *   1. The web app creates a 6-character pairing code via POST /api/pair/create.
 *   2. The user pastes the code into the plugin's dock widget. The plugin
 *      opens a WebSocket to /api/studio/ws?code=XXXXXX.
 *   3. The relay links the WS to the pair. The web app then sends commands
 *      via POST /api/studio/request (X-Pair-Code header), which the relay
 *      forwards to the plugin over WS.
 *
 * The Tauri desktop mode (localhost:3001) is preserved for users who run
 * the desktop app; the pair-based relay is auto-selected when running on
 * the web (browser, no Tauri runtime).
 */

const BRIDGE_URL =
  (import.meta.env.VITE_STUD_API_URL as string | undefined) ?? "http://localhost:3001";
const RELAY_BASE =
  (import.meta.env.VITE_STUD_RELAY_URL as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin : "");
const TIMEOUT_MS = 60_000;

const isWebMode =
  typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

const PAIR_KEY = "stud:pairCode";

export type StudioResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function getStoredPairCode(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PAIR_KEY);
}

function setStoredPairCode(code: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (code) localStorage.setItem(PAIR_KEY, code);
  else localStorage.removeItem(PAIR_KEY);
}

export async function createPair(): Promise<{ code: string; expiresAt: number }> {
  const res = await fetch(`${RELAY_BASE}/api/pair/create`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create pair: ${res.status}`);
  const data = (await res.json()) as { code: string; expiresAt: number };
  setStoredPairCode(data.code);
  return data;
}

export function getPairCode(): string | null {
  return getStoredPairCode();
}

export function clearPair(): void {
  setStoredPairCode(null);
}

export async function checkPairStatus(
  code: string,
): Promise<{ connected: boolean; project: string | null }> {
  try {
    const res = await fetch(
      `${RELAY_BASE}/api/studio/status?code=${encodeURIComponent(code)}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) return { connected: false, project: null };
    return (await res.json()) as { connected: boolean; project: string | null };
  } catch {
    return { connected: false, project: null };
  }
}

export async function studioRequest<T>(
  endpoint: string,
  data?: object,
): Promise<StudioResponse<T>> {
  if (isWebMode) {
    return studioRequestViaRelay<T>(endpoint, data);
  }
  return studioRequestViaLocal<T>(endpoint, data);
}

async function studioRequestViaRelay<T>(
  endpoint: string,
  data?: object,
): Promise<StudioResponse<T>> {
  const code = getStoredPairCode();
  if (!code) {
    return {
      success: false,
      error:
        "Not paired with Roblox Studio. Click 'Connect Studio' to generate a pairing code, then enter it in the Studio plugin.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${RELAY_BASE}/api/studio/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pair-Code": code,
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        path: endpoint,
        body: data ? JSON.stringify(data) : undefined,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: `Bad response (${res.status}): ${text}` };
    }

    if (!res.ok) {
      if (res.status === 401) clearPair();
      return { success: false, error: json.error ?? `Error ${res.status}` };
    }

    if (json.error) return { success: false, error: json.error };
    return { success: true, data: json as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { success: false, error: "Request timed out waiting for Studio response" };
    }
    return { success: false, error: `Failed to connect: ${e}` };
  } finally {
    clearTimeout(timer);
  }
}

async function studioRequestViaLocal<T>(
  endpoint: string,
  data?: object,
): Promise<StudioResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BRIDGE_URL}/stud/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: endpoint,
        body: data ? JSON.stringify(data) : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return { success: false, error: json.error || `Error ${response.status}` };
      } catch {
        return { success: false, error: `Studio error ${response.status}: ${text}` };
      }
    }

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { success: false, error: "Request timed out waiting for Studio response" };
    }
    return { success: false, error: `Failed to connect: ${e}` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function isStudioConnected(): Promise<boolean> {
  if (isWebMode) {
    const code = getStoredPairCode();
    if (!code) return false;
    const status = await checkPairStatus(code);
    return status.connected;
  }

  try {
    const response = await fetch(`${BRIDGE_URL}/stud/status`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return false;
    const status = await response.json();
    return status.connected === true;
  } catch {
    return false;
  }
}

export async function isBridgeRunning(): Promise<boolean> {
  if (isWebMode) return true;
  try {
    const response = await fetch(`${BRIDGE_URL}/stud/status`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function notConnectedError(): string {
  if (isWebMode) {
    return `Roblox Studio is not connected.

To use Roblox Studio tools from the web:
1. Open Roblox Studio and install the stud-bridge plugin
2. Click 'Connect Studio' here to get a pairing code
3. Paste the code into the plugin's dock widget
4. The plugin will pair with this website`;
  }

  return `Roblox Studio is not connected.

To use Roblox Studio tools:
1. Make sure Stud desktop app is running (it starts the bridge server)
2. Open Roblox Studio
3. Install the Stud plugin from studio-plugin/ folder
4. Enable the plugin in Studio
5. The plugin will automatically connect to Stud`;
}