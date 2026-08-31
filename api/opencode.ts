/**
 * Vercel serverless proxy for the OpenCode Zen gateway.
 *
 *   POST /api/opencode/v1/chat/completions  -> streams the chat completion
 *   POST /api/opencode/v1/responses         -> streams the responses request
 *   GET  /api/opencode/v1/models            -> returns the model catalog
 *   anything else under /api/opencode/v1/... -> forwarded verbatim
 *
 * OpenCode Zen does not send CORS headers, so the browser cannot reach
 * https://opencode.ai/zen/... directly. This route forwards each request
 * server-to-server and streams SSE responses back unchanged.
 *
 * No environment variables are required. Requests are anonymous unless the
 * caller passes an Authorization header.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
  },
};

const OPENCODE_API_BASE = "https://opencode.ai/zen/v1";

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function joinPath(path: string, query: NodeJS.Dict<string | string[]>): string {
  const base = `${OPENCODE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query || Object.keys(query).length === 0) return base;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((vv) => vv != null && search.append(k, String(vv)));
    else if (v != null) search.append(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function handler(req: any, res: any): Promise<void> {
  const url = (req.url || "") as string;
  // Strip "/api/opencode" prefix; keep the rest of the path verbatim.
  const stripped = url.replace(/^\/?api\/opencode/, "");
  const pathOnly = stripped.split("?")[0] || "/";
  const queryIdx = url.indexOf("?");
  const queryString = queryIdx >= 0 ? url.slice(queryIdx + 1) : "";
  const upstreamQuery: NodeJS.Dict<string | string[]> = {};
  if (queryString) {
    for (const [k, v] of new URLSearchParams(queryString)) {
      upstreamQuery[k] = v;
    }
  }
  const target = joinPath(pathOnly, upstreamQuery);

  // Allow GET + POST; refuse others.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Build forward headers. Pass through Authorization if the caller supplied
  // one, otherwise send an anonymous key (Zen accepts empty/anonymous for
  // its free models).
  const forwardHeaders: Record<string, string> = {
    "Content-Type": String(req.headers?.["content-type"] || "application/json"),
    Accept: String(req.headers?.accept || "application/json, text/event-stream"),
    Authorization: String(req.headers?.authorization || "Bearer anonymous"),
  };

  let body: Buffer | undefined;
  if (req.method === "POST") {
    try {
      body = await readRawBody(req as IncomingMessage);
    } catch {
      res.status(400).json({ error: "Failed to read request body" });
      return;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method === "POST" ? body : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: `Upstream fetch failed: ${(err as Error).message}` });
    return;
  }

  res.status(upstream.status);
  const passthrough = res as ServerResponse;
  const contentType = upstream.headers.get("content-type") || "application/json";
  passthrough.setHeader("Content-Type", contentType);
  passthrough.setHeader("Cache-Control", "no-cache");
  if (typeof (passthrough as any).flushHeaders === "function") {
    (passthrough as any).flushHeaders();
  }

  if (!upstream.body) {
    passthrough.end();
    return;
  }

  const nodeStream = Readable.fromWeb(upstream.body as unknown as import("node:stream/web").ReadableStream);
  nodeStream.on("error", (err) => {
    console.error("[api/opencode] stream error:", err);
    passthrough.end();
  });
  nodeStream.pipe(passthrough);
}

export {};
