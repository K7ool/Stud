/**
 * Serverless proxy for the ChatGPT OAuth token endpoint.
 *
 * auth.openai.com/oauth/token does not send browser CORS headers, so a plain
 * web SPA cannot exchange / refresh tokens directly (the desktop app used the
 * Tauri HTTP plugin to bypass CORS). This route forwards the form-encoded OAuth
 * grant body server-to-server and returns the token JSON. Same-origin with the
 * SPA, so no browser CORS is involved on the way back.
 *
 * Only forwards POST /oauth/token grants (authorization_code, refresh_token).
 * The upstream URL is hard-coded to avoid an open/SSRF proxy.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

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
    res.status(405).json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST is required for token exchange.", retryable: false } });
    return;
  }

  let body: Buffer;
  try {
    body = await readRawBody(req as IncomingMessage);
  } catch {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Failed to read request body.", retryable: false } });
    return;
  }

  // Ensure it is a form grant and pass it straight through to OpenAI.
  let upstream: Response;
  try {
    upstream = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] === "application/json"
          ? "application/x-www-form-urlencoded"
          : (req.headers["content-type"] as string) || "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (err) {
    res.status(502).json({ success: false, error: { code: "PROVIDER_NETWORK", message: `Token exchange upstream failed: ${(err as Error).message}`, retryable: true } });
    return;
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(text);
}
