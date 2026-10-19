/**
 * 云同步的纯逻辑层：打包快照、解包校验、冲突判定。
 *
 * 这里只做计算，不发网络请求（网络在 utils/gist.js）。
 * 这样三个函数都能进单测，也不破坏 core 无副作用的约定。
 */

/** 存档标识，用来确认「这份 gist 确实是本应用写的」 */
export const SNAPSHOT_APP = "texas-poker";

/** 快照格式版本，字段结构变了就 +1，并在 parseSnapshot 里补兼容分支 */
export const SNAPSHOT_VERSION = 1;

/**
 * gist 单文件建议上限（字节）。API 读取时内容超过 1MB 会被截断，
 * 留足余量提前告警。流水本身有 200 局上限，正常用不到这条线。
 */
export const SNAPSHOT_SIZE_WARN = 900 * 1024;

/**
 * 打包一份云端快照。
 *
 * daily（今日领奖状态）**故意不进云**：它只记「哪天领过奖」，跨天自动作废，
 * 备份它没意义，恢复回去反而会让免费抽卡被误判成已领。
 *
 * @param {Object} source { players, history, settings, cards }
 * @param {number} now 时间戳，方便单测固定
 */
export function buildSnapshot(source, now = Date.now()) {
  const data = source && typeof source === "object" ? source : {};
  return {
    app: SNAPSHOT_APP,
    snapshotVersion: SNAPSHOT_VERSION,
    updatedAt: Number.isFinite(Number(now)) ? Number(now) : 0,
    players: Array.isArray(data.players) ? data.players : [],
    history: Array.isArray(data.history) ? data.history : [],
    settings: data.settings && typeof data.settings === "object" ? data.settings : {},
    cards: data.cards && typeof data.cards === "object" ? data.cards : {},
  };
}

/**
 * 解析云端快照。任何一处不合法都返回 ok:false 并给出中文原因，
 * 绝不把半截数据交给调用方写进本地。
 *
 * @param {string|Object} raw gist 里的文件内容（字符串）或已解析对象
 * @returns {{ok: boolean, reason?: string, snapshot?: Object}}
 */
export function parseSnapshot(raw) {
  let data = raw;

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { ok: false, reason: "云端存档是空的" };
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, reason: "云端存档不是合法的 JSON，可能已被截断或损坏" };
    }
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "云端存档格式不对" };
  }
  if (data.app !== SNAPSHOT_APP) {
    return { ok: false, reason: "这份存档不是德州扑克结算的数据" };
  }
  if (!Array.isArray(data.players)) {
    return { ok: false, reason: "存档里没有玩家名册，可能已损坏" };
  }

  return {
    ok: true,
    snapshot: {
      app: SNAPSHOT_APP,
      snapshotVersion: Number(data.snapshotVersion) || 0,
      updatedAt: Number(data.updatedAt) || 0,
      players: data.players,
      history: Array.isArray(data.history) ? data.history : [],
      settings: data.settings && typeof data.settings === "object" ? data.settings : {},
      cards: data.cards && typeof data.cards === "object" ? data.cards : {},
    },
  };
}

/**
 * 冲突判定：谁的 updatedAt 新听谁的。
 *
 * 虽然实际是一人记账（单写者），但仍要防「换设备后本地是旧数据，
 * 一上传把云端新的覆盖掉」——这是最容易丢数据的场景。
 *
 * @returns {"upload"|"download"|"same"}
 */
export function decideSync(localUpdatedAt, remoteUpdatedAt) {
  const local = Number(localUpdatedAt) || 0;
  const remote = Number(remoteUpdatedAt) || 0;
  if (remote > local) return "download";
  if (local > remote) return "upload";
  return "same";
}

/**
 * 快照序列化后的字节数。用_encodeURIComponent 兜底算中文，
 * gist 存的是 UTF-8 文本，中文按 3 字节算。
 */
export function snapshotSize(snapshot) {
  try {
    return new Blob([JSON.stringify(snapshot)]).size;
  } catch (error) {
    // 老浏览器没有 Blob 构造器时退回字符数估算
    return JSON.stringify(snapshot).length;
  }
}

/** 是否接近 gist 的 1MB 截断线 */
export function isSnapshotTooBig(snapshot) {
  return snapshotSize(snapshot) > SNAPSHOT_SIZE_WARN;
}
