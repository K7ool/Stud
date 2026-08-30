/**
 * Browser shim for @tauri-apps/plugin-fs.
 */
export async function readTextFile(_path: string, _options?: unknown): Promise<string> {
  console.warn("[web-shim] readTextFile not supported in browser");
  throw new Error("Filesystem access not available in web build");
}

export async function writeTextFile(
  _path: string,
  _data: string,
  _options?: unknown,
): Promise<void> {
  console.warn("[web-shim] writeTextFile not supported in browser");
  throw new Error("Filesystem access not available in web build");
}

export async function readDir(_path: string, _options?: unknown): Promise<unknown[]> {
  return [];
}

export async function exists(_path: string): Promise<boolean> {
  return false;
}

export async function mkdir(_path: string, _options?: unknown): Promise<void> {
  console.warn("[web-shim] mkdir not supported in browser");
}

export async function remove(_path: string, _options?: unknown): Promise<void> {
  console.warn("[web-shim] remove not supported in browser");
}

export const BaseDirectory = {
  AppData: 0,
  AppLocalData: 1,
  AppCache: 2,
  AppConfig: 3,
  AppLog: 4,
  Desktop: 5,
  Document: 6,
  Download: 7,
  Home: 8,
  Resource: 9,
  Temp: 10,
} as const;