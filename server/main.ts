/**
 * 德州扑克结算 · 实时同步后端（跑在 Deno Deploy 免费层）
 *
 * 职责很窄：按「房间码」存一份快照，变化时推给订阅方。
 * 后端不认识任何业务字段 —— 快照就是前端 core/sync.js 里 buildSnapshot 的产物，
 * 这里只校验 app 标识、体积和 updatedAt 新旧。
 *
 * 接口：
 *   GET  /api/ping                 健康检查
 *   GET  /api/state?room=xxx       读取快照
 *   POST /api/state?room=xxx       写入快照（默认拒绝比云端更旧的数据，?force=1 强制）
 *   GET  /api/watch?room=xxx       SSE，快照变化时推送
 */

const SIZE_LIMIT = 2 * 1024 * 1024;
const ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function badRoom(room: string): Response | null {
  if (!room) return json({ ok: false, reason: "缺少房间码" }, 400);
  if (!ROOM_RE.test(room)) {
    return json({
      ok: false,
      reason: "房间码只能由字母、数字、下划线和短横线组成，长度 4~64",
    }, 400);
  }
  return null;
}

const kv = await Deno.openKv();

/** 读快照。房间为空时返回 { ok:true, snapshot:null }，前端据此判断「云端还没有数据」 */
async function handleGet(room: string): Promise<Response> {
  const entry = await kv.get(["state", room]);
  return json({ ok: true, snapshot: entry.value ?? null });
}

/**
 * 写快照。默认拒绝「比云端更旧」的写入 —— 换设备后本机可能是旧数据，
 * 直接覆盖就把新战绩冲掉了。真要以本机为准就带 ?force=1。
 */
async function handlePost(
  room: string,
  req: Request,
  force: boolean,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "请求体不是合法 JSON" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, reason: "数据格式不对" }, 400);
  }
  if (body.app !== "texas-poker") {
    return json({ ok: false, reason: "这不是德州扑克结算的存档" }, 400);
  }
  if (!Array.isArray(body.players)) {
    return json({ ok: false, reason: "存档里没有玩家名册，可能已损坏" }, 400);
  }

  const text = JSON.stringify(body);
  if (text.length > SIZE_LIMIT) {
    return json({
      ok: false,
      reason: `存档超过 ${Math.floor(SIZE_LIMIT / 1024 / 1024)}MB，已拒绝写入`,
    }, 413);
  }

  const existing = await kv.get(["state", room]);
  const remoteUpdatedAt =
    Number((existing.value as { updatedAt?: number } | null)?.updatedAt) || 0;
  const incoming = Number(body.updatedAt) || 0;

  if (!force && incoming < remoteUpdatedAt) {
    return json({
      ok: false,
      reason: "云端有更新的数据，已拒绝覆盖",
      remoteUpdatedAt,
    }, 409);
  }

  await kv.set(["state", room], body);
  return json({ ok: true, updatedAt: incoming, size: text.length });
}

/** SSE：靠 Deno KV 的 watch 推送变化，前端 EventSource 断线会自动重连 */
function handleWatch(room: string, req: Request): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      send("ready", { room });

      // 25 秒一行注释，防止中间层把空闲连接掐掉
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 25000);

      const stop = () => {
        if (closed) return;
        closed = true;
        if (heartbeat !== undefined) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* 已经关了 */
        }
      };

      req.signal.addEventListener("abort", stop);

      const watcher = kv.watch([["state", room]]);
      try {
        for await (const events of watcher) {
          if (closed) break;
          for (const item of events) {
            const value = (item as { value?: unknown }).value;
            if (value) send("state", value);
          }
        }
      } catch {
        /* 连接断开时会走到这里，忽略 */
      } finally {
        try {
          await watcher.cancel();
        } catch {
          /* 已经关了 */
        }
        stop();
      }
    },
    cancel() {
      closed = true;
      if (heartbeat !== undefined) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/ping" || path === "" || path === "/") {
    return json({ ok: true, service: "texas-poker-sync", time: Date.now() });
  }

  if (path !== "/api/state" && path !== "/api/watch") {
    return json({ ok: false, reason: "接口不存在" }, 404);
  }

  const room = (url.searchParams.get("room") ?? "").trim();
  const invalid = badRoom(room);
  if (invalid) return invalid;

  if (path === "/api/watch") {
    if (req.method !== "GET") {
      return json({ ok: false, reason: "只支持 GET" }, 405);
    }
    return handleWatch(room, req);
  }

  if (req.method === "GET") return await handleGet(room);
  if (req.method === "POST") {
    return await handlePost(room, req, url.searchParams.get("force") === "1");
  }
  return json({ ok: false, reason: "只支持 GET / POST" }, 405);
});
