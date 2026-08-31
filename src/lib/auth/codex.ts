/**
 * ChatGPT Plus/Pro OAuth Authentication via Codex
 *
 * Uses OAuth 2.0 with PKCE to authenticate with OpenAI's auth server
 * and proxy requests through ChatGPT's Codex API endpoint.
 *
 * Web device-code only: OpenAI's Codex OAuth client locks its redirect URI to
 * http://localhost:1455, which a website cannot serve. The official headless
 * alternative is the "device auth" flow the Codex CLI uses (`codex login
 * --device-auth`). It needs no callback at all: the user opens a verification
 * URL, enters a one-time code in any browser, and the app polls OpenAI until
 * the user authorizes. All device-auth HTTP calls go through the serverless
 * proxy (/api/codex/device) because auth.openai.com does not send CORS headers
 * to the browser.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// OAuth Configuration
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
// Use Tauri HTTP plugin to bypass CORS when calling Codex API
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_PROXY_ENDPOINT = "/api/codex";
const isWebMode = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

// Token storage key
const AUTH_STORAGE_KEY = "stud_chatgpt_auth";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

export interface OAuthAuth {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
}

export interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  email?: string;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
}

interface PkceCodes {
  verifier: string;
  challenge: string;
}

// PKCE Helper Functions
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

function decodeJwt(token: string): IdTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payload = parts[1];
  const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decoded);
}

export function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}

// Refresh access token
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

// Storage functions
export function getStoredAuth(): OAuthAuth | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveAuth(auth: OAuthAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  const auth = getStoredAuth();
  const result = auth !== null && auth.refresh !== undefined;
  if (import.meta.env.DEV) {
    console.log("[Codex] isAuthenticated check:", { hasAuth: auth !== null, hasRefresh: auth?.refresh !== undefined, result });
  }
  return result;
}

// Get valid access token (refreshing if needed)
export async function getValidAccessToken(): Promise<string | null> {
  const auth = getStoredAuth();
  if (!auth) return null;

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (auth.expires - bufferMs > Date.now()) {
    return auth.access;
  }

  // Refresh the token
  try {
    console.log("[Codex] Refreshing access token...");
    const tokens = await refreshAccessToken(auth.refresh);

    let accountId = auth.accountId;
    if (tokens.id_token) {
      const claims = decodeJwt(tokens.id_token);
      accountId = extractAccountIdFromClaims(claims) || accountId;
    }

    const newAuth: OAuthAuth = {
      type: "oauth",
      access: tokens.access_token,
      refresh: tokens.refresh_token || auth.refresh,
      expires: Date.now() + tokens.expires_in * 1000,
      accountId,
    };

    saveAuth(newAuth);
    return newAuth.access;
  } catch (error) {
    console.error("[Codex] Token refresh failed:", error);
    clearAuth();
    return null;
  }
}

// ---- Device-code (device auth) flow ----

export interface DeviceCodeData {
  device_auth_id: string;
  user_code: string;
  interval: number;
  verification_url: string;
  expires_in?: number;
}

interface DevicePollSuccess {
  authorization_code: string;
  code_challenge: string;
  code_verifier: string;
}

// Request a one-time device user code.
export async function startDeviceCode(): Promise<DeviceCodeData> {
  const res = await fetch(`${CODEX_PROXY_ENDPOINT}?step=code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not start device sign-in (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    device_auth_id: data.device_auth_id,
    user_code: data.user_code,
    interval: Number(data.interval) || 5,
    verification_url: data.verification_url || `${ISSUER}/codex/device`,
    expires_in: data.expires_in,
  };
}

// Poll OpenAI until the user has authorized, then return the PKCE + auth code.
// Resolves with the poll result when authorization is complete, `null` while still pending.
export async function pollDeviceCode(
  deviceAuthId: string,
  userCode: string
): Promise<DevicePollSuccess | null> {
  const res = await fetch(`${CODEX_PROXY_ENDPOINT}?step=poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
  });

  // OpenAI returns 4xx (forbidden/not-found) while the user is still pending.
  if (res.status === 403 || res.status === 404 || res.status === 409) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device sign-in check failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.authorization_code || !data.code_verifier) {
    return null;
  }
  return {
    authorization_code: data.authorization_code,
    code_challenge: data.code_challenge,
    code_verifier: data.code_verifier,
  };
}

async function exchangeDeviceCode(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const res = await fetch(`${CODEX_PROXY_ENDPOINT}?step=token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Complete a device-code login: exchange the authorization code and persist.
export async function completeDeviceCodeLogin(
  deviceAuthId: string,
  userCode: string,
  poll: DevicePollSuccess
): Promise<OAuthAuth> {
  const tokens = await exchangeDeviceCode(poll.authorization_code, poll.code_verifier);

  let accountId: string | undefined;
  if (tokens.id_token) {
    try {
      const claims = decodeJwt(tokens.id_token);
      accountId = extractAccountIdFromClaims(claims);
    } catch {
      accountId = undefined;
    }
  }

  const auth: OAuthAuth = {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: Date.now() + tokens.expires_in * 1000,
    accountId,
  };

  saveAuth(auth);
  sessionStorage.removeItem("codex_device_auth_id");
  sessionStorage.removeItem("codex_device_user_code");
  return auth;
}

// Codex fetch wrapper - uses Tauri HTTP plugin to bypass CORS
export async function codexFetch(
  _input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  console.log("[Codex] codexFetch called");

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.error("[Codex] No valid access token available");
    throw new Error("Not authenticated with ChatGPT Plus/Pro");
  }

  const auth = getStoredAuth();

  console.log("[Codex] Making request to Codex API via Tauri HTTP plugin");

  // Build headers
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Set ChatGPT Account ID for organization subscriptions
  if (auth?.accountId) {
    headers["ChatGPT-Account-Id"] = auth.accountId;
  }

  const endpoint = isWebMode ? CODEX_PROXY_ENDPOINT : CODEX_API_ENDPOINT;

  const response = await tauriFetch(endpoint, {
    ...init,
    headers,
  });

  console.log("[Codex] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const text = await response.text();
    console.error("[Codex] Error response:", text);
    throw new Error(`Codex API error: ${response.status} - ${text}`);
  }

  return response;
}

// Allowed Codex models for Plus/Pro users - from models.dev
export const CODEX_MODELS = [
  // GPT-5 series (top priority)
  { id: "gpt-5.2", name: "GPT-5.2", description: "Latest GPT-5.2", isNew: true },
  { id: "gpt-5.2-chat-latest", name: "GPT-5.2 Latest", description: "Most recent GPT-5.2", isNew: true },
  { id: "gpt-5.1", name: "GPT-5.1", description: "GPT-5.1 release", isNew: true },
  { id: "gpt-5.1-chat-latest", name: "GPT-5.1 Latest", description: "Most recent GPT-5.1", isNew: true },
  { id: "gpt-5", name: "GPT-5", description: "Base GPT-5 model", isNew: true },
  { id: "gpt-5-pro", name: "GPT-5 Pro", description: "Pro version", isNew: true },
  { id: "gpt-5-mini", name: "GPT-5 Mini", description: "Fast and efficient", isNew: true },
  { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Ultrafast", isNew: true },
  { id: "gpt-5-thinking", name: "GPT-5 Thinking", description: "Extended reasoning", reasoning: true, isNew: true },
  // GPT-4 series
  { id: "chatgpt-4o-latest", name: "ChatGPT-4o Latest", description: "Latest ChatGPT-4o" },
  { id: "gpt-4o", name: "GPT-4o", description: "GPT-4 Omni" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and efficient" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "GPT-4.1 release" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", description: "Compact GPT-4.1" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", description: "Ultrafast" },
  // Reasoning models
  { id: "o3", name: "o3", description: "Latest reasoning", reasoning: true, isNew: true },
  { id: "o3-mini", name: "o3 Mini", description: "Fast reasoning", reasoning: true },
  { id: "o3-pro", name: "o3 Pro", description: "Pro reasoning", reasoning: true, isNew: true },
  { id: "o4-mini", name: "o4 Mini", description: "Next-gen reasoning", reasoning: true, isNew: true },
  { id: "o1", name: "o1", description: "Original reasoning", reasoning: true },
  { id: "o1-mini", name: "o1 Mini", description: "Fast o1", reasoning: true },
  { id: "o1-pro", name: "o1 Pro", description: "Pro o1", reasoning: true },
] as const;
