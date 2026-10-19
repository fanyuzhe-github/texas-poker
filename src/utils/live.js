/**
 * 实时同步的网络层（对应 Deno Deploy 上的 server/main.ts）。
 *
 * 这里是唯一发请求的地方，core 保持无副作用。
 * 所有失败都转成中文原因返回，绝不抛异常给调用方——同步失败不能影响记账。
 */

import { parseSnapshot } from "../core/sync";

const TIMEOUT = 15000;

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

async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    try {
      body = await res.json();
    } catch (error) {
      return { ok: false, reason: `服务返回了看不懂的内容（HTTP ${res.status}）` };
    }
    if (res.status === 404) {
      return { ok: false, reason: "这个地址上没有同步服务，检查地址是否填对" };
    }
    if (res.status >= 500) {
      return { ok: false, reason: "同步服务暂时不可用，稍后再试" };
    }
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, reason: (body && body.reason) || `同步失败（HTTP ${res.status}）`, remoteUpdatedAt: body && body.remoteUpdatedAt };
    }
    return { ok: true, ...body };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return { ok: false, reason: "连接超时（15 秒），网络可能较慢" };
    }
    return { ok: false, reason: "连不上同步服务，检查地址与网络" };
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
 * 订阅云端变化（SSE）。返回关闭函数。
 *
 * EventSource 自带重连，断网恢复后会自动接上，这里不额外做退避。
 * onError 每次断线都会触发，调用方自己决定要不要提示。
 */
export function subscribeState(endpoint, room, handlers = {}) {
  const { onSnapshot, onOpen, onError } = handlers;
  const url = watchUrl(endpoint, room);
  let stopped = false;
  let source = null;

  try {
    source = new EventSource(url);
  } catch (error) {
    if (onError) onError("浏览器不支持实时连接，将改用打开时拉取");
    return () => {};
  }

  source.addEventListener("ready", () => {
    if (onOpen) onOpen();
  });

  source.addEventListener("state", (event) => {
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
    if (onError) onError("实时连接中断，正在自动重连");
  };

  return () => {
    stopped = true;
    if (source) source.close();
  };
}
