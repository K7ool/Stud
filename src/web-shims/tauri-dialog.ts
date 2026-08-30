/**
 * Browser shim for @tauri-apps/plugin-dialog.
 */
export async function open(_options?: unknown): Promise<string | null> {
  console.warn("[web-shim] dialog.open not supported in browser");
  return null;
}

export async function save(_options?: unknown): Promise<string | null> {
  console.warn("[web-shim] dialog.save not supported in browser");
  return null;
}

export async function message(_message: string, _options?: unknown): Promise<void> {
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(_message);
  }
}

export async function ask(_message: string, _options?: unknown): Promise<boolean> {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(_message);
  }
  return false;
}

export async function confirm(_message: string, _options?: unknown): Promise<boolean> {
  return ask(_message, _options);
}