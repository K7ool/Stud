/**
 * Browser shim for @tauri-apps/plugin-http.
 * Provides `fetch` that delegates to the global fetch (which works in browsers).
 */
export async function fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input as RequestInfo, init);
}

export const Response = globalThis.Response;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;

export type FetchOptions = RequestInit;