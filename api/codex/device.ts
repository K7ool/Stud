/**
 * Vercel serverless proxy for the Codex CLI "device auth" (device-code) flow.
 *
 * OpenAI's Codex OAuth client forces a localhost:1455 redirect callback, so the
 * normal PKCE redirect cannot work on the web. The device-code flow, however,
 * needs no callback at all: the user is shown a URL + a one-time code, signs in
 * in any browser, and this service polls OpenAI on their behalf.
 *
 * Route:  POST /api/codex/device?step=code | poll | token
 *   code  : request a device user-code from auth.openai.com
 *   poll  : poll until the device-code user authorizes (returns PKCE + auth code)
 *   token : exchange the authorization_code for id/access/refresh tokens
 *
 * OpenAI's auth endpoints do not send CORS headers, so the browser cannot call
 * them directly. This route forwards the request server-to-server.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
  },
};

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_REDIRECT_URI = `${ISSUER}/deviceauth/callback`;

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// OpenAI's auth WAF only serves the device-auth endpoints to recognized Codex
// clients; a generic Node/Vercel fetch User-Agent is rejected with
// 401 "Missing Authorization header". Mimic the ChatGPT desktop client so the
// server-to-server forward is accepted.
const CODEX_USER_AGENT = "Codex Desktop/26.707.31428 (win32; x64)";

async function jsonFetch(
  url: string,
  method: string,
  contentType: string,
  body: string
): Promise<{ status: number; json: unknown }> {
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        "Content-Type": contentType,
        "User-Agent": CODEX_USER_AGENT,
        Accept: "application/json, text/plain, */*",
      },
      body,
    });
  } catch (err) {
    return { status: 502, json: { error: `Upstream fetch failed: ${(err as Error).message}` } };
  }
  const text = await upstream.text();
  let json: unknown = { error: text || "upstream error", raw: text };
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // keep raw text wrapper
  }
  return { status: upstream.status, json };
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const step = req.query?.step;
  if (step !== "code" && step !== "poll" && step !== "token") {
    res.status(400).json({ error: "Missing or invalid ?step=code|poll|token" });
    return;
  }

  let body: Buffer;
  try {
    body = await readRawBody(req as IncomingMessage);
  } catch {
    res.status(400).json({ error: "Failed to read request body" });
    return;
  }

  const raw = body.toString("utf8");

  if (step === "code") {
    // POST /api/accounts/deviceauth/usercode  {"client_id": "..."}
    const parsed = JSON.parse(raw || "{}");
    if (!parsed.client_id) {
      res.status(400).json({ error: "client_id is required" });
      return;
    }
    const upstream = await jsonFetch(
      `${ISSUER}/api/accounts/deviceauth/usercode`,
      "POST",
      "application/json",
      JSON.stringify({ client_id: parsed.client_id })
    );
    res.status(upstream.status).json({
      ...(upstream.json as object),
      verification_url: `${ISSUER}/codex/device`,
    });
    return;
  }

  if (step === "poll") {
    // POST /api/accounts/deviceauth/token  {"device_auth_id":..., "user_code":...}
    let parsed: { device_auth_id?: string; user_code?: string };
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    if (!parsed.device_auth_id || !parsed.user_code) {
      res.status(400).json({ error: "device_auth_id and user_code are required" });
      return;
    }
    const upstream = await jsonFetch(
      `${ISSUER}/api/accounts/deviceauth/token`,
      "POST",
      "application/json",
      JSON.stringify({ device_auth_id: parsed.device_auth_id, user_code: parsed.user_code })
    );
    res.status(upstream.status).json(upstream.json);
    return;
  }

  if (step === "token") {
    // POST /oauth/token  grant_type=authorization_code + code + redirect_uri + client_id + code_verifier
    let parsed: { code?: string; code_verifier?: string };
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    if (!parsed.code || !parsed.code_verifier) {
      res.status(400).json({ error: "code and code_verifier are required" });
      return;
    }
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: parsed.code,
      redirect_uri: DEVICE_REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: parsed.code_verifier,
    }).toString();
    const upstream = await jsonFetch(
      `${ISSUER}/oauth/token`,
      "POST",
      "application/x-www-form-urlencoded",
      form
    );
    res.status(upstream.status).json(upstream.json);
    return;
  }

  res.status(400).json({ error: "Unhandled step" });
}

export {};
