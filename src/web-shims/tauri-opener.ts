/**
 * Browser shim for @tauri-apps/plugin-opener.
 */
export async function openUrl(url: string, _openWith?: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openPath(_path: string, _openWith?: string): Promise<void> {
  console.warn("[web-shim] openPath not supported in browser");
}

export async function revealItemInDir(_path: string): Promise<void> {
  console.warn("[web-shim] revealItemInDir not supported in browser");
}