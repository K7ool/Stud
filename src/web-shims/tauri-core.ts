/**
 * Browser shim for @tauri-apps/api/core.
 * Provides `invoke()` and a stub for `convertFileSrc`.
 */
export async function invoke<T = unknown>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  console.warn(`[web-shim] invoke(${_cmd}) called in browser — no Tauri runtime available.`);
  throw new Error(
    "Tauri IPC is not available in the web build. Use the Stud desktop app to access Roblox Studio.",
  );
}

export function convertFileSrc(_path: string, _protocol = "asset"): string {
  return _path;
}

export const Channel = class {
  constructor(_handler?: unknown) {}
};

export const addPluginListener = async () => () => {};

export type InvokeOptions = Record<string, unknown>;