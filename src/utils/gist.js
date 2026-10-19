/**
 * Gist 网络层：唯一的发请求的地方。
 *
 * 约定：
 * - 一律走 secret gist（不出现在公开列表里）
 * - 每次请求带超时，手机上 GitHub API 可能很慢，不能让用户干等
 * - 错误一律转成中文短句交给 UI，不把 GitHub 的原始 JSON 抛出去
 */

const API_BASE = "https://api.github.com/gists";
const GIST_FILENAME = "texas-poker-backup.json";
const GIST_DESCRIPTION = "德州扑克结算系统 - 数据备份";
const API_VERSION = "2026-03-10";
const TIMEOUT_MS = 15000;

/** 把 HTTP 状态码翻译成人话 */
function statusMessage(status) {
  if (status === 401) return "token 无效或已过期，请重新生成一个";
  if (status === 403) return "请求被拒绝，可能是触发了 GitHub 的频率限制，稍后再试";
  if (status === 404) return "找不到这份云端存档，可能已被删除";
  if (status === 422) return "数据没通过 GitHub 校验，可能太大了";
  if (status >= 500) return "GitHub 服务暂时不可用，稍后再试";
  return `同步失败（${status}）`;
}

async function request(url, { method = "GET", token, body } = {}) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      signal: controller ? controller.signal : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = new Error(statusMessage(res.status));
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("连接超时，请检查网络后重试");
    }
    // fetch 本身失败（断网 / DNS）没有 message，补一句
    if (error instanceof TypeError) {
      throw new Error("连不上 GitHub，请检查网络");
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 新建一个 secret gist，返回 gist id */
export async function createGist(token, content) {
  const data = await request(API_BASE, {
    method: "POST",
    token,
    body: {
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content } },
    },
  });
  return data && data.id ? String(data.id) : "";
}

/** 覆盖已有 gist 的内容 */
export async function updateGist(token, gistId, content) {
  await request(`${API_BASE}/${encodeURIComponent(gistId)}`, {
    method: "PATCH",
    token,
    body: { files: { [GIST_FILENAME]: { content } } },
  });
  return true;
}

/**
 * 读取云端内容。
 * 内容超过 1MB 时 GitHub 会把 truncated 置为 true 并截断 content，
 * 这种情况下改用 raw_url 把完整内容再拉一次。
 */
export async function fetchGist(token, gistId) {
  const data = await request(`${API_BASE}/${encodeURIComponent(gistId)}`, { token });
  const file = data && data.files ? data.files[GIST_FILENAME] : null;
  if (!file) throw new Error("云端存档里没有找到备份文件");

  if (file.truncated && file.raw_url) {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(file.raw_url, {
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error(statusMessage(res.status));
      return await res.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return typeof file.content === "string" ? file.content : "";
}

/** 看看 token 能不能用，顺便验证 gist 是否还在 */
export async function checkToken(token) {
  await request(API_BASE, { token });
  return true;
}
