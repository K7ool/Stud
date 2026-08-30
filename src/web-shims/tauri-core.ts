/**
 * Browser shim for @tauri-apps/api/core.
 * Provides `invoke()` that returns safe defaults for known Tauri commands
 * instead of throwing — so desktop-only flows degrade gracefully on web.
 */
type InvokeResult = unknown;

const STUB_RESPONSES: Record<string, InvokeResult> = {
  check_plugin_installed: { installed: false, is_current_version: false, path: null },
  install_plugin: { success: false, message: "Plugin installation is only available in the Stud desktop app." },
  check_roblox_studio_installed: false,
  auto_detect_project: null,
  get_project_path: null,
  set_project_path: null,
  list_files: [],
  read_file: null,
  write_file: { success: false, error: "File operations are only available in the Stud desktop app." },
};

export async function invoke<T = unknown>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  if (cmd in STUB_RESPONSES) {
    return STUB_RESPONSES[cmd] as T;
  }
  console.warn(`[web-shim] invoke(${cmd}) called in browser — no Tauri runtime available.`);
  return null as T;
}

export function convertFileSrc(_path: string, _protocol = "asset"): string {
  return _path;
}

export const Channel = class {
  constructor(_handler?: unknown) {}
};

export const addPluginListener = async () => () => {};

export type InvokeOptions = Record<string, unknown>;