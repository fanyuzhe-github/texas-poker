/**
 * 德州扑克结算 · 实时同步后端（跑在 Deno Deploy 免费层）
 *
 * 职责很窄：按「房间码」存一份快照，变化时推给订阅方。
 * 后端不认识任何业务字段 —— 快照就是前端 core/sync.js 里 buildSnapshot 的产物，
 * 这里只校验 app 标识、体积和 updatedAt 新旧。
 *
 * 接口：
 *   GET  /api/ping                 健康检查
 *   GET  /api/state?room=xxx       读取快照（带 ?since=N 时无变化只回一行 unchanged）
 *   POST /api/state?room=xxx       写入快照（默认拒绝比云端更旧的数据，?force=1 强制）
 *   GET  /api/watch?room=xxx       SSE 推送（⚠️ 已弃用，前端改用轮询，见下）
 *
 * 为什么弃用 SSE：长连接会让实例一直「被加载」，Deno 按 768MB × 每秒计内存时间，
 * 免费额度（150 GiB·hr）一台设备挂一夜就烧掉一大截，实测直接触发 USAGE_EXCEEDED 停服。
 * 改成短轮询后实例能缩容到 0，代价是最多 10 秒延迟。
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

/** 只存「版本号 + 体积」的小记录，轮询时先读它，避免每次都把整份快照拉下来 */
type Meta = { updatedAt: number; size: number };

/**
 * 读快照。房间为空时返回 { ok:true, snapshot:null }，前端据此判断「云端还没有数据」。
 *
 * 带 ?since=<updatedAt> 时走快路径：先读 meta（很小），云端没有更新就只回一行
 * { ok:true, unchanged:true }，不把整份快照传下去。
 * 前端每 10 秒问一次，绝大多数请求都落在这一行上 —— 省流量，也省 KV 读单元。
 */
async function handleGet(room: string, since: number): Promise<Response> {
  const meta = await kv.get<Meta>(["meta", room]);
  const metaUpdatedAt = Number(meta.value?.updatedAt) || 0;

  if (since > 0 && metaUpdatedAt > 0 && metaUpdatedAt <= since) {
    return json({ ok: true, unchanged: true, updatedAt: metaUpdatedAt });
  }

  const entry = await kv.get(["state", room]);
  const snapshot = (entry.value ?? null) as { updatedAt?: number } | null;
  const updatedAt = Number(snapshot?.updatedAt) || 0;

  // 老数据（加 meta 之前写的）这里补一条，下次轮询就能走快路径
  if (!meta.value && snapshot) {
    await kv.set(["meta", room], { updatedAt, size: 0 });
  }

  return json({ ok: true, snapshot, updatedAt });
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
  // 版本号单独存一份小的，供轮询做「有没有变化」的快速判断
  await kv.set(["meta", room], { updatedAt: incoming, size: text.length });
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

      // 心跳防中间层掐空闲连接。⚠️ 必须是「有名字的事件」而不是 : 注释行 ——
      // 注释行不触发任何 JS 事件，前端就无从判断这条连接还活着。
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: {"t":${Date.now()}}\n\n`),
          );
        } catch {
          closed = true;
        }
      }, 20000);

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

  if (req.method === "GET") {
    return await handleGet(room, Number(url.searchParams.get("since")) || 0);
  }
  if (req.method === "POST") {
    return await handlePost(room, req, url.searchParams.get("force") === "1");
  }
  return json({ ok: false, reason: "只支持 GET / POST" }, 405);
});
