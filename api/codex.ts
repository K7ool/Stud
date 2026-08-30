/**
 * Vercel serverless proxy for the ChatGPT Codex Responses API.
 * The ChatGPT backend does not send CORS headers, so the browser cannot call it
 * directly. This route forwards the request body and the user's bearer token
 * server-to-server and streams the SSE response back.
 *
 * Uses Node.js runtime (not Edge) so we can pipe the upstream response body
 * directly without buffering.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authorization = req.headers["authorization"];
  const accountId = req.headers["chatgpt-account-id"];

  if (!authorization || typeof authorization !== "string") {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  let body: Buffer;
  try {
    body = await readRawBody(req as IncomingMessage);
  } catch (err) {
    res.status(400).json({ error: "Failed to read request body" });
    return;
  }

  const upstreamHeaders: Record<string, string> = {
    Authorization: authorization,
    "Content-Type": (req.headers["content-type"] as string) ?? "application/json",
    Accept: (req.headers["accept"] as string) ?? "text/event-stream",
  };
  if (accountId && typeof accountId === "string") {
    upstreamHeaders["ChatGPT-Account-Id"] = accountId;
  }

  let upstream: Response;
  try {
    upstream = await fetch(CODEX_API_ENDPOINT, {
      method: "POST",
      headers: upstreamHeaders,
      body,
    });
  } catch (err) {
    res.status(502).json({ error: `Upstream fetch failed: ${(err as Error).message}` });
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    res.setHeader(key, value);
  });
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const nodeRes = res as ServerResponse;
  nodeRes.on("close", () => {
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const ok = nodeRes.write(Buffer.from(value));
      if (!ok) {
        await new Promise<void>((resolve) => nodeRes.once("drain", () => resolve()));
      }
    }
  } finally {
    nodeRes.end();
  }
}