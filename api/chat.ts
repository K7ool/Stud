/**
 * Chat persistence API (conversations, messages, memories).
 *
 * Single endpoint that routes by URL path so the same Vercel Edge Function
 * serves every `/api/chat/*` request. Auth: requires a non-empty uid via
 * X-User-Id or ?uid=; no third-party auth here (consistent with the rest
 * of the app).
 *
 *   GET    /api/chat/conversations                 list
 *   POST   /api/chat/conversations                 create
 *   GET    /api/chat/conversations/:id             read
 *   PATCH  /api/chat/conversations/:id             update
 *   DELETE /api/chat/conversations/:id             delete
 *   GET    /api/chat/conversations/:id/messages    list
 *   PUT    /api/chat/conversations/:id/messages    set all
 *   POST   /api/chat/conversations/:id/messages    append
 *   GET    /api/chat/memories                      list
 *   POST   /api/chat/memories                      create
 *   PATCH  /api/chat/memories/:id                  update
 *   DELETE /api/chat/memories/:id                  delete
 */

import {
  appendMessages,
  createConversation,
  createMemory,
  deleteConversation,
  deleteMemory,
  getConversation,
  getUserId,
  listConversations,
  listMemories,
  listMessages,
  patchConversation,
  patchMemory,
  setMessages,
  unauthorized,
  type Conversation,
  type Memory,
  type StoredMessage,
} from "./_chat/db";

export const config = { runtime: "edge" };

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

function bad(msg: string, code = 400) {
  return json({ error: msg }, { status: code });
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function segmentsFromUrl(req: Request): string[] {
  try {
    const url = new URL(req.url);
    // /api/chat/...
    return url.pathname.replace(/^.*\/api\/chat\/?/, "").split("/").filter(Boolean);
  } catch {
    return [];
  }
}

export default async function handler(req: Request): Promise<Response> {
  const uid = getUserId(req);
  if (!uid) return unauthorized();

  const segs = segmentsFromUrl(req);
  const method = req.method.toUpperCase();
  const [head, second, third] = segs;

  // /api/chat/conversations
  if (head === "conversations" && !second) {
    if (method === "GET") {
      const list = await listConversations(uid);
      return json({ conversations: list });
    }
    if (method === "POST") {
      const body = (await readJson(req)) as { id?: string; projectId?: string; title?: string } | null;
      if (!body || !body.id) return bad("Missing id");
      const conv = await createConversation(uid, body.projectId || "default", body.id, body.title);
      return json({ conversation: conv }, { status: 201 });
    }
    return bad("Method not allowed", 405);
  }

  // /api/chat/conversations/:id[ /messages]
  if (head === "conversations" && second) {
    if (!third) {
      if (method === "GET") {
        const c = await getConversation(uid, second);
        return c ? json({ conversation: c }) : bad("Not found", 404);
      }
      if (method === "PATCH") {
        const body = (await readJson(req)) as Partial<Conversation> | null;
        if (!body) return bad("Missing body");
        const updated = await patchConversation(uid, second, {
          title: body.title,
          status: body.status,
          projectId: body.projectId,
          lastMessageAt: body.lastMessageAt,
        });
        return updated ? json({ conversation: updated }) : bad("Not found", 404);
      }
      if (method === "DELETE") {
        await deleteConversation(uid, second);
        return json({ ok: true });
      }
      return bad("Method not allowed", 405);
    }
    if (third === "messages") {
      if (method === "GET") {
        const m = await listMessages(uid, second);
        return json({ messages: m });
      }
      if (method === "PUT") {
        const body = (await readJson(req)) as { messages?: StoredMessage[] } | null;
        if (!body || !Array.isArray(body.messages)) return bad("Missing messages");
        await setMessages(uid, second, body.messages);
        return json({ ok: true, count: body.messages.length });
      }
      if (method === "POST") {
        const body = (await readJson(req)) as { messages?: StoredMessage[] } | null;
        if (!body || !Array.isArray(body.messages)) return bad("Missing messages");
        await appendMessages(uid, second, body.messages);
        return json({ ok: true, count: body.messages.length });
      }
      return bad("Method not allowed", 405);
    }
  }

  // /api/chat/memories
  if (head === "memories" && !second) {
    if (method === "GET") {
      const list = await listMemories(uid);
      return json({ memories: list });
    }
    if (method === "POST") {
      const body = (await readJson(req)) as Partial<Memory> | null;
      if (!body || !body.key || !body.value || !body.category || !body.scope) {
        return bad("Missing required memory fields");
      }
      const mem = await createMemory(uid, {
        projectId: body.projectId ?? null,
        scope: body.scope,
        category: body.category,
        key: body.key,
        value: body.value,
        confidence: typeof body.confidence === "number" ? body.confidence : 0.7,
        sourceConversationId: body.sourceConversationId,
      });
      return json({ memory: mem }, { status: 201 });
    }
    return bad("Method not allowed", 405);
  }

  // /api/chat/memories/:id
  if (head === "memories" && second) {
    if (method === "PATCH") {
      const body = (await readJson(req)) as Partial<Memory> | null;
      if (!body) return bad("Missing body");
      const updated = await patchMemory(uid, second, {
        value: body.value,
        confidence: body.confidence,
        scope: body.scope,
        category: body.category,
        key: body.key,
      });
      return updated ? json({ memory: updated }) : bad("Not found", 404);
    }
    if (method === "DELETE") {
      await deleteMemory(uid, second);
      return json({ ok: true });
    }
    return bad("Method not allowed", 405);
  }

  return bad("Not found", 404);
}
