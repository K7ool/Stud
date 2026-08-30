/**
 * Chat persistence API (conversations, messages, memories, tasks).
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
 *   GET    /api/chat/tasks                         list
 *   POST   /api/chat/tasks                         create
 *   GET    /api/chat/tasks/:id                     read
 *   PATCH  /api/chat/tasks/:id                     update
 *   DELETE /api/chat/tasks/:id                     delete
 *   POST   /api/chat/tasks/:id/start               mark running
 *   POST   /api/chat/tasks/:id/pause               mark paused
 *   POST   /api/chat/tasks/:id/cancel              mark cancelled
 *   POST   /api/chat/tasks/:id/retry               reset to pending
 *   POST   /api/chat/tasks/reorder                 renumber queue
 */

import {
  appendMessages,
  createConversation,
  createMemory,
  createTask,
  deleteConversation,
  deleteMemory,
  deleteTask,
  getConversation,
  getRunningAndQueued,
  getTask,
  getUserId,
  listConversations,
  listMemories,
  listMessages,
  listTasks,
  patchConversation,
  patchMemory,
  patchTask,
  reorderQueue,
  setMessages,
  unauthorized,
  type Conversation,
  type Memory,
  type StoredMessage,
  type Task,
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

  // /api/chat/tasks/reorder
  if (head === "tasks" && second === "reorder" && !third) {
    if (method === "POST") {
      const list = await reorderQueue(uid);
      return json({ tasks: list });
    }
    return bad("Method not allowed", 405);
  }

  // /api/chat/tasks
  if (head === "tasks" && !second) {
    if (method === "GET") {
      const list = await listTasks(uid);
      return json({ tasks: list });
    }
    if (method === "POST") {
      const body = (await readJson(req)) as Partial<Task> | null;
      if (!body || !body.id || !body.title || !body.prompt || !body.conversationId) {
        return bad("Missing required task fields (id, title, prompt, conversationId)");
      }
      const task = await createTask(uid, {
        id: body.id,
        projectId: body.projectId || "default",
        conversationId: body.conversationId,
        title: body.title,
        prompt: body.prompt,
        status: body.status || "pending",
        priority: body.priority || "normal",
        mode: body.mode || "auto",
        effort: body.effort || "medium",
        createdAt: body.createdAt || Date.now(),
        steps: body.steps,
        startedAt: body.startedAt,
        completedAt: body.completedAt,
        result: body.result,
        error: body.error,
      });
      return json({ task }, { status: 201 });
    }
    return bad("Method not allowed", 405);
  }

  // /api/chat/tasks/active — convenience: pending+running+paused+needs_resume
  if (head === "tasks" && second === "active" && !third) {
    if (method === "GET") {
      const list = await getRunningAndQueued(uid);
      return json({ tasks: list });
    }
    return bad("Method not allowed", 405);
  }

  // /api/chat/tasks/:id[/action]
  if (head === "tasks" && second) {
    if (!third) {
      if (method === "GET") {
        const t = await getTask(uid, second);
        return t ? json({ task: t }) : bad("Not found", 404);
      }
      if (method === "PATCH") {
        const body = (await readJson(req)) as Partial<Task> | null;
        if (!body) return bad("Missing body");
        const updated = await patchTask(uid, second, body);
        return updated ? json({ task: updated }) : bad("Not found", 404);
      }
      if (method === "DELETE") {
        await deleteTask(uid, second);
        return json({ ok: true });
      }
      return bad("Method not allowed", 405);
    }
    if (method === "POST") {
      const body = (await readJson(req)) as { reason?: string } | null;
      switch (third) {
        case "start": {
          const t = await patchTask(uid, second, {
            status: "running",
            startedAt: body?.reason ? Date.now() : Date.now(),
            error: undefined,
          });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
        case "pause": {
          const t = await patchTask(uid, second, { status: "paused" });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
        case "cancel": {
          const t = await patchTask(uid, second, {
            status: "cancelled",
            completedAt: Date.now(),
            error: body?.reason || "Cancelled by user",
          });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
        case "retry": {
          const cur = await getTask(uid, second);
          if (!cur) return bad("Not found", 404);
          const updated = await patchTask(uid, second, {
            status: "pending",
            error: undefined,
            retryCount: (cur.retryCount || 0) + 1,
            completedAt: undefined,
            progress: 0,
          });
          return json({ task: updated });
        }
        case "complete": {
          const t = await patchTask(uid, second, {
            status: "completed",
            completedAt: Date.now(),
            progress: 1,
          });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
        case "fail": {
          const t = await patchTask(uid, second, {
            status: "failed",
            completedAt: Date.now(),
            error: body?.reason || "Task failed",
          });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
        case "needs_resume": {
          const t = await patchTask(uid, second, { status: "needs_resume" });
          return t ? json({ task: t }) : bad("Not found", 404);
        }
      }
    }
    return bad("Not found", 404);
  }

  return bad("Not found", 404);
}
