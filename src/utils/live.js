/**
 * 实时同步的网络层（对应 Deno Deploy 上的 server/main.ts）。
 *
 * 这里是唯一发请求的地方，core 保持无副作用。
 * 所有失败都转成中文原因返回，绝不抛异常给调用方——同步失败不能影响记账。
 */

import { parseSnapshot } from "../core/sync";

const TIMEOUT = 15000;

// 假死判定：服务端 20 秒一次心跳，连着 70 秒没收到任何东西就重连。
// 取 20 秒的 3 倍多，容忍丢一两次心跳和轻微的网络抖动。
const WATCHDOG_INTERVAL = 15000;
const SILENCE_LIMIT = 70000;

/** 把用户粘贴的地址收拾干净：去尾斜杠、补协议 */
export function normalizeEndpoint(raw) {
  let url = String(raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export function isValidRoom(room) {
  return /^[A-Za-z0-9_-]{4,64}$/.test(String(room || "").trim());
}

/** 随机房间码，避免别人猜到你的数据 */
export function randomRoom() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function watchUrl(endpoint, room) {
  return `${normalizeEndpoint(endpoint)}/api/watch?room=${encodeURIComponent(room)}`;
}

function stateUrl(endpoint, room, force) {
  const query = `?room=${encodeURIComponent(room)}${force ? "&force=1" : ""}`;
  return `${normalizeEndpoint(endpoint)}/api/state${query}`;
}

function pollUrl(endpoint, room, since) {
  const query = `?room=${encodeURIComponent(room)}${since > 0 ? `&since=${since}` : ""}`;
  return `${normalizeEndpoint(endpoint)}/api/state${query}`;
}

async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    let parseFailed = false;
    try {
      body = await res.json();
    } catch (error) {
      parseFailed = true;
    }
    // 先按状态码判，再看响应体：停服时返回的是纯文本，先解析就会误报「看不懂的内容」
    if (res.status === 404) {
      return { ok: false, reason: "这个地址上没有同步服务，检查地址是否填对" };
    }
    if (res.status === 503 || res.status === 429) {
      return { ok: false, reason: "同步服务额度已用完，暂时停服（数据仍在云端，不会丢）" };
    }
    if (res.status >= 500) {
      return { ok: false, reason: "同步服务暂时不可用，稍后再试" };
    }
    if (parseFailed) {
      return { ok: false, reason: `服务返回了看不懂的内容（HTTP ${res.status}）` };
    }
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, reason: (body && body.reason) || `同步失败（HTTP ${res.status}）`, remoteUpdatedAt: body && body.remoteUpdatedAt };
    }
    return { ok: true, ...body };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return { ok: false, reason: "连接超时（15 秒），网络可能较慢" };
    }
    // 浏览器拿不到跨域响应的内容（服务停服时 503 不带 CORS 头），
    // 这里分不清是「断网」还是「服务端挂了」，文案要把两种可能都说出来。
    return {
      ok: false,
      reason: "连不上同步服务：网络不通，或服务端已停服（免费额度用完时会暂停）",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 健康检查，用于「测试连接」按钮 */
export async function pingEndpoint(endpoint) {
  const base = normalizeEndpoint(endpoint);
  if (!base) return { ok: false, reason: "还没填服务地址" };
  const result = await request(`${base}/api/ping`, { method: "GET" });
  if (!result.ok) return result;
  if (result.service !== "texas-poker-sync") {
    return { ok: false, reason: "这个地址不是德州扑克的同步服务" };
  }
  return { ok: true };
}

/** 读取云端快照。云端还没数据时 snapshot 为 null，不算错误 */
export async function fetchState(endpoint, room) {
  const result = await request(stateUrl(endpoint, room, false), { method: "GET" });
  if (!result.ok) return result;
  if (!result.snapshot) return { ok: true, snapshot: null };
  return parseSnapshot(result.snapshot);
}

/** 上传快照。force=true 表示「就以本机为准」，绕过云端更新检查 */
export async function pushState(endpoint, room, snapshot, force = false) {
  return request(stateUrl(endpoint, room, force), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
}

/**
 * 轮询云端有没有新数据（实时同步的主通道）。
 *
 * 为什么不长连接：SSE 会让 Deno 实例一直「被加载」，免费额度按 768MB × 每秒
 * 计内存时间，一台设备挂一夜就能把整月额度烧穿，直接把应用停掉。
 * 短轮询每次只活一两秒、随后缩容到 0，成本低两个数量级。
 *
 * since 传本机已知的最新时间戳，云端没变时只回一行 { unchanged:true }，
 * 不下发整份快照。
 */
export async function pollState(endpoint, room, since = 0) {
  const result = await request(pollUrl(endpoint, room, since), { method: "GET" });
  if (!result.ok) return result;
  if (result.unchanged) {
    return { ok: true, unchanged: true, updatedAt: Number(result.updatedAt) || 0 };
  }
  if (!result.snapshot) return { ok: true, unchanged: false, snapshot: null };
  const parsed = parseSnapshot(result.snapshot);
  if (!parsed.ok) return { ...parsed, unchanged: false };
  return { ...parsed, unchanged: false };
}

/**
 * 订阅云端变化（SSE）。返回关闭函数。
 *
 * ⚠️ 已弃用：前端实时同步改用 pollState 轮询。保留实现仅为兼容与排查，
 * 服务端 /api/watch 也还在，但**不要**在页面里重新接上——长连接会把
 * Deno 免费额度烧穿（详见 server/main.ts 顶部注释）。
 */
export function subscribeState(endpoint, room, handlers = {}) {
  const { onSnapshot, onOpen, onError, onStatus } = handlers;
  const url = watchUrl(endpoint, room);

  let stopped = false;
  let source = null;
  let lastMsgAt = Date.now();
  let status = "connecting";
  let watchdog = null;

  function setStatus(next) {
    if (status === next) return;
    status = next;
    if (onStatus) onStatus(next);
  }

  if (typeof EventSource === "undefined") {
    if (onError) onError("浏览器不支持实时连接，将改用打开时拉取");
    setStatus("down");
    return () => {};
  }

  function open() {
    if (stopped) return;
    source = new EventSource(url);

    source.addEventListener("ready", () => {
      lastMsgAt = Date.now();
      setStatus("live");
      if (onOpen) onOpen();
    });

    source.addEventListener("ping", () => {
      lastMsgAt = Date.now();
      setStatus("live");
    });

    source.addEventListener("state", (event) => {
      lastMsgAt = Date.now();
      setStatus("live");
      let data = null;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      const parsed = parseSnapshot(data);
      if (parsed.ok && onSnapshot) onSnapshot(parsed.snapshot);
    });

    source.onerror = () => {
      if (stopped) return;
      setStatus("down");
      // EventSource 自己会退避重连，这里只回报状态，不重复建连接
      if (onError) onError("实时连接中断，正在自动重连");
    };
  }

  /**
   * 主动重连。休眠唤醒、切 WiFi、代理掐掉空闲连接之后，
   * 那条连接会变成「开着但收不到东西」的假死状态 —— EventSource 不报 onerror，
   * 只有「多久没收到消息」能看出来。
   */
  function reconnect() {
    if (stopped) return;
    if (source) {
      source.close();
      source = null;
    }
    lastMsgAt = Date.now();
    setStatus("connecting");
    open();
  }

  // 服务端 20 秒一次心跳，连着 70 秒一点动静都没有，认定假死
  watchdog = setInterval(() => {
    if (stopped) return;
    if (Date.now() - lastMsgAt >= SILENCE_LIMIT) reconnect();
  }, WATCHDOG_INTERVAL);

  open();

  const close = () => {
    stopped = true;
    if (watchdog) clearInterval(watchdog);
    if (source) source.close();
  };
  close.reconnect = reconnect;
  return close;
}
