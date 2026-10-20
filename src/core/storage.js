/**
 * 持久化层：所有 localStorage 读写都必须经过这里。
 * 目标：任何一条脏数据都不允许把页面搞白屏。
 */
import { yuan } from "./money.js";
import { normalizeCardState } from "./cards.js";
import { normalizeAvatar } from "./avatar.js";

/** 数据结构版本，后续字段变更时递增并补充 migrate 分支 */
export const SCHEMA_VERSION = 4;

export const STORAGE_KEYS = {
  /** 沿用旧 key，保证老用户的排行榜数据不丢 */
  players: "allPlayers",
  history: "poker:history",
  settings: "poker:settings",
  cards: "poker:cards",
  /** 今日结算：只记「哪天领过奖」，跨天自动作废，不进备份 */
  daily: "poker:daily",
  /** 云备份配置（token / gistId / 上次同步时间）。只在本机，永远不进云端快照 */
  cloud: "poker:cloud",
};

const VALID_STATES = ["win", "lose", "deuce"];

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 安全读取：解析失败 / 数据损坏一律回退到 fallback */
export function safeRead(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw === undefined || raw === "") return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.warn(`[storage] 读取 ${key} 失败，已回退到默认值`, error);
    return fallback;
  }
}

/** 安全写入：配额超限 / 隐私模式 / 序列化异常都不会抛到调用方 */
export function safeWrite(key, value) {
  // key 忘了登记会写出一个名为 "undefined" 的脏键，静默失败最难查，直接拦住
  if (!key) {
    console.warn("[storage] 写入被跳过：key 为空");
    return false;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`[storage] 写入 ${key} 失败`, error);
    return false;
  }
}

/**
 * 把任意来源的玩家对象补齐成合法结构。
 * 老数据可能缺 lastState / stateTimes / raceResult，这里统一兜底。
 */
export function normalizePlayer(raw, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const raceResult =
    source.raceResult && typeof source.raceResult === "object"
      ? source.raceResult
      : {};

  // parent 指向主账号名；为空表示自己就是主账号（或尚未归类的独立玩家）
  const parentName = String(source.parent == null ? "" : source.parent).trim();

  return {
    seatNum: Number.isFinite(Number(source.seatNum))
      ? Number(source.seatNum)
      : index,
    name: String(source.name == null ? "" : source.name).trim(),
    parent: parentName || null,
    // 顶层账号分两种：isMain=true 是主账号（可上桌，也可挂子账号做汇总）；
    // false（老数据没有这个字段）按「独立号」处理，同样可以上桌
    isMain: !parentName && source.isMain === true,
    chips: yuan(source.chips),
    raceResult: {
      win: Math.max(0, toInt(raceResult.win)),
      lose: Math.max(0, toInt(raceResult.lose)),
      deuce: Math.max(0, toInt(raceResult.deuce)),
    },
    raceDate: Number(source.raceDate) || Date.now(),
    score: yuan(source.score),
    // 头像认不出来（脏数据 / 已下架的内置头像）一律清空，回落到昵称色块头像
    avatar: normalizeAvatar(source.avatar),
    lastState: VALID_STATES.includes(source.lastState)
      ? source.lastState
      : "deuce",
    stateTimes: Math.max(0, toInt(source.stateTimes)),
  };
}

/** 读取总排行榜，顺带做去重与清洗 */
export function loadPlayers() {
  const raw = safeRead(STORAGE_KEYS.players, []);
  const list = Array.isArray(raw) ? raw : [];

  const seen = new Set();
  const players = list
    .map((item, index) => normalizePlayer(item, index))
    .filter((player) => {
      if (!player.name || seen.has(player.name)) return false;
      seen.add(player.name);
      return true;
    });

  // 清洗失效的归属：指向自己或指向不存在的账号，一律降级为独立玩家
  const names = new Set(players.map((player) => player.name));
  const hasChildren = new Set(
    players
      .filter((player) => player.parent && names.has(player.parent))
      .map((player) => player.parent)
  );

  return players.map((player) => {
    if (!player.parent) {
      // 名下有子账号的顶层账号一律按主账号处理（老数据补标记）
      return { ...player, isMain: player.isMain || hasChildren.has(player.name) };
    }
    if (player.parent === player.name || !names.has(player.parent)) {
      return { ...player, parent: null };
    }
    return player;
  });
}

/* ------------------------------------------------------------------ */
/* 本地改动广播                                                        */
/* ------------------------------------------------------------------ */

const changeListeners = new Set();
let muteDepth = 0;

/**
 * 订阅「本机数据被改写」。
 * 云备份靠它知道该推一次了 —— 逐个操作点去补调用太容易漏，
 * 所以统一在这层发信号，以后新加的写入点自动生效。
 *
 * @param {(kind: string) => void} fn kind 是 players / history / settings / cards
 * @returns {() => void} 取消订阅
 */
export function onLocalChange(fn) {
  if (typeof fn !== "function") return () => {};
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/**
 * 包住「不该触发上传」的本地写入：应用云端快照、从云端恢复。
 * 不这么做就会把自己刚收下来的数据原样推回去。
 * ⚠️ 只支持同步回调。
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function muteLocalChange(fn) {
  muteDepth += 1;
  try {
    return fn();
  } finally {
    muteDepth = Math.max(0, muteDepth - 1);
  }
}

function notifyLocalChange(kind) {
  if (muteDepth > 0) return;
  changeListeners.forEach((fn) => {
    try {
      fn(kind);
    } catch (error) {
      // 订阅方自己炸了，不能连累落盘
      console.warn("[storage] 本地改动订阅回调出错", error);
    }
  });
}

export function savePlayers(list) {
  const ok = safeWrite(STORAGE_KEYS.players, Array.isArray(list) ? list : []);
  if (ok) notifyLocalChange("players");
  return ok;
}

/** 读取对局历史，按时间倒序返回 */
export function loadHistory() {
  const raw = safeRead(STORAGE_KEYS.history, []);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((item) => item && typeof item === "object" && Array.isArray(item.records))
    .map((item) => ({
      id: String(item.id || `${item.time || Date.now()}`),
      time: Number(item.time) || Date.now(),
      baseChips: yuan(item.baseChips),
      records: item.records.map((record) => ({
        name: String(record.name == null ? "" : record.name).trim(),
        seatNum: Number(record.seatNum) || 0,
        chips: yuan(record.chips),
        delta: yuan(record.delta),
        result: VALID_STATES.includes(record.result) ? record.result : "deuce",
      })),
      transfers: Array.isArray(item.transfers) ? item.transfers : [],
    }))
    .sort((a, b) => b.time - a.time);
}

export function saveHistory(list) {
  const ok = safeWrite(STORAGE_KEYS.history, Array.isArray(list) ? list : []);
  if (ok) notifyLocalChange("history");
  return ok;
}

const DEFAULT_SETTINGS = {
  version: SCHEMA_VERSION,
  baseChips: 10,
};

export function loadSettings() {
  const raw = safeRead(STORAGE_KEYS.settings, {});
  const source = raw && typeof raw === "object" ? raw : {};
  const baseChips = Number(source.baseChips);
  return {
    version: SCHEMA_VERSION,
    baseChips: Number.isFinite(baseChips) && baseChips > 0 ? baseChips : DEFAULT_SETTINGS.baseChips,
  };
}

export function saveSettings(settings) {
  const ok = safeWrite(STORAGE_KEYS.settings, {
    ...DEFAULT_SETTINGS,
    ...settings,
    version: SCHEMA_VERSION,
  });
  if (ok) notifyLocalChange("settings");
  return ok;
}

/**
 * 卡牌存档。与排行榜不同，这个必须落盘 —— 抽卡是随机事件，
 * 靠重放 history 是算不回来的，刷新即丢会让用户立刻不信任这套系统。
 */
export function loadCards() {
  return normalizeCardState(safeRead(STORAGE_KEYS.cards, null));
}

export function saveCards(state) {
  const ok = safeWrite(STORAGE_KEYS.cards, normalizeCardState(state));
  if (ok) notifyLocalChange("cards");
  return ok;
}

/* ------------------------------------------------------------------ */
/* 今日结算                                                            */
/* ------------------------------------------------------------------ */

/** 今天几号（本地时区），跨天判定全用它，别到处 new Date() */
export function todayKey(time = Date.now()) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 今日结算的领奖状态。只记「哪天、谁领过冠军奖励」，
 * 过了当天就自动作废 —— 免费抽卡一天只能领一次。
 */
export function normalizeDaily(raw, today = todayKey()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const date = String(source.date || "").trim();
  if (date !== today) return { version: SCHEMA_VERSION, date: today, claimed: false, name: "" };
  return {
    version: SCHEMA_VERSION,
    date: today,
    claimed: source.claimed === true,
    name: String(source.name == null ? "" : source.name).trim(),
  };
}

export function loadDaily() {
  return normalizeDaily(safeRead(STORAGE_KEYS.daily, null));
}

export function saveDaily(state) {
  return safeWrite(STORAGE_KEYS.daily, normalizeDaily(state));
}

/* ------------------------------------------------------------------ */
/* 云备份配置                                                          */
/* ------------------------------------------------------------------ */

/**
 * 云备份的本机配置。
 * token 属于敏感信息，只落本机 localStorage，
 * 打包快照时**绝不能**把它带进去（buildSnapshot 里也没有这个字段）。
 */
export function normalizeCloud(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const token = String(source.token == null ? "" : source.token).trim();
  return {
    token,
    gistId: String(source.gistId == null ? "" : source.gistId).trim(),
    lastSyncAt: Number(source.lastSyncAt) || 0,
    /** 结算后自动上传，默认开——这是「防丢」的核心 */
    autoBackup: source.autoBackup !== false,
    /** 上次成功备份时的快照时间，用来和云端比对新旧 */
    syncedUpdatedAt: Number(source.syncedUpdatedAt) || 0,
  };
}

export function loadCloud() {
  return normalizeCloud(safeRead(STORAGE_KEYS.cloud, null));
}

export function saveCloud(config) {
  return safeWrite(STORAGE_KEYS.cloud, normalizeCloud(config));
}

/** 断开云备份：连 token 一起抹掉，不留残骸 */
export function clearCloud() {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.cloud);
    return true;
  } catch (error) {
    console.warn("[storage] 清除云备份配置失败", error);
    return false;
  }
}

/** 一次性把旧版本遗留的脏字段就地修好 */
export function migrate() {
  const players = loadPlayers();
  if (players.length) savePlayers(players);
  saveSettings(loadSettings());
  // 早期版本有 key 未登记导致写出的 "undefined" 脏键，顺手清掉
  try {
    window.localStorage.removeItem("undefined");
  } catch (error) {
    /* 隐私模式下删不掉也无所谓，不影响业务 */
  }
}
