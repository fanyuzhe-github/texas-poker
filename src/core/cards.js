/**
 * 卡牌收集系统：抽卡、保底、碎片合成、图鉴进度、奖券发放。
 *
 * 设计约定（改动前必读）：
 *
 * 1. **这是第一个需要写存储的奖励系统**。勋章墙是重放 `history` 算出来的（纯派生、无状态），
 *    但抽卡是随机事件 —— 结果必须落盘，否则刷新页面卡牌就没了，用户立刻不信任这套东西。
 *    所以奖券、卡包、保底计数、碎片全部存在 `poker:cards` 里，由 storage.js 统一读写。
 *
 * 2. **随机数必须种子化**（`mulberry32`）。两个理由：
 *      - 单测可复现，能断言"第 60 抽必出 5★"这种硬保底；
 *      - 出了问题能复盘"他上次的十连到底出了什么"。
 *    每次抽完把新种子写回 state，保证序列连续但不重复。
 *
 * 3. **奖券一定要发给输家**。只给赢家发券，几场下来新手彻底掉队，牌局本身就散了。
 *    所以"输光"给安慰券、"翻盘"给双倍券，上桌还有一份保底券。
 *
 * 4. **同一主账号在一局里开多个号不叠加券**：同组按主账号合并后，每条规则取最大值。
 *    否则一个人开两个号上桌就能刷双倍券。
 *
 * 5. **保底是每人独立的**（pity 存在各自的 player 桶里），不是全局共享 —— 否则
 *    "你抽了 9 次没出货，我第一抽就中了 5★"这种事会让熟人局当场吵起来。
 *
 * 6. 依赖方向：cards → cardPool / ranking / money。本文件不依赖 records / season /
 *    streak / achievements —— 勋章联动由调用方把 `newMedals` 算好传进来，刷新纪录同理
 *    由调用方传 `newRecords`（用 records.js 的 `buildNewRecords` 对比前后两份流水），
 *    保持单向无环。⚠️ 别为了算纪录在本文件 import records.js。
 */
import { POOL_BY_STAR, CARD_POOL, CARD_TOTAL, cardById } from "./cardPool.js";
import { mainOf } from "./ranking.js";
import { toCents } from "./money.js";

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

export const STARS = [1, 2, 3, 4, 5];

/** 五档稀有度权重（和为 100） */
export const STAR_WEIGHT = { 1: 60, 2: 25, 3: 10, 4: 4, 5: 1 };

/** 十抽内必出 3★ 及以上 */
export const PITY_3 = 10;
/** 60 抽硬天井必出 5★ */
export const PITY_5 = 60;
/** 从第 50 抽起 5★ 概率线性拉升（软保底），比硬保底手感自然 */
export const SOFT_PITY_5 = 50;
export const SOFT_PITY_STEP = 0.06;

/** 重复卡转化成的碎片 */
export const SHARD_OF = { 1: 1, 2: 3, 3: 10, 4: 30, 5: 100 };

/** 碎片合成一张指定卡的代价 */
export const CRAFT_COST = { 1: 5, 2: 12, 3: 40, 4: 120, 5: 300 };

/** 一抽几张券 */
export const TICKETS_PER_PULL = 3;
/**
 * 十连定价（7 折，省 9 张券）。
 * 为什么是 21 而不是 27：一局普通地赢下来只发 2 张券（上桌 1 + 赢 1），
 * 一晚 4 局约 8 张 —— 27 意味着要攒三个半晚上，十连按钮基本等于摆设。
 * 定在 21，顺手的那一晚（赢 + 大赢 + 翻盘 + 勋章）能摸到，攒两晚则稳稳能抽。
 */
export const TICKETS_PER_TEN = 21;
export const TEN_PULL_SIZE = 10;

/** 抽卡日志最多保留多少条 */
const LOG_LIMIT = 60;

export const CARD_SCHEMA_VERSION = 1;

/**
 * 奖券规则表：UI 直接渲染它来解释"券从哪来"，改规则只要改这一处。
 * check 收到的是归集后的单个主账号在本局的表现。
 */
export const TICKET_RULES = [
  {
    key: "showUp",
    label: "上桌",
    tickets: 1,
    hint: "来就有，保证人人有进度",
    check: () => true,
  },
  {
    key: "win",
    label: "赢一局",
    tickets: 1,
    hint: "最直觉的正反馈",
    check: (info) => info.result === "win",
  },
  {
    key: "bigWin",
    label: "单局赢 ≥ 2 倍底注",
    tickets: 1,
    hint: "高光时刻加码",
    check: (info) => info.result === "win" && info.cents >= info.stake * 2,
  },
  {
    key: "busted",
    label: "输光",
    tickets: 1,
    hint: "安慰券，越输越没得玩就散了",
    check: (info) => info.busted,
  },
  {
    key: "comeback",
    label: "翻盘（输光后下一局就赢）",
    tickets: 2,
    hint: "最有剧本感的一件事",
    check: (info) => info.comeback,
  },
  {
    key: "medal",
    label: "首次点亮勋章",
    detailLabel: "点亮勋章",
    tickets: 2,
    hint: "与勋章系统联动，按枚数叠加",
    check: (info) => info.medals > 0,
    times: (info) => info.medals,
    details: (info) => info.medalTitles,
  },
  {
    key: "record",
    label: "创造新纪录",
    detailLabel: "新纪录",
    tickets: 5,
    hint: "刷新单局型纪录（单局最高 / 碾压王 / 单局最惨 / 翻盘王 / 连败终结者），按项叠加；赛季·连胜这类累计型不算",
    check: (info) => info.newRecords > 0,
    times: (info) => info.newRecords,
    details: (info) => info.recordTitles,
  },
];

/* ------------------------------------------------------------------ */
/* 种子随机                                                            */
/* ------------------------------------------------------------------ */

/**
 * 「还没播过种」的出厂值。
 * ⚠️ 这个值不能真的拿去抽卡：所有出厂玩家共用它 → 抽出来完全一样。
 *    见 drawCards 里的懒播种。
 */
export const FRESH_SEED = 1;

/**
 * mulberry32：32 位种子的轻量伪随机。够快、够均匀、序列完全可复现。
 * @param {number} seed
 * @returns {() => number} 返回 [0, 1) 的函数
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  const next = function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 预热：小种子（1、2、3…）的头两个输出明显偏低且可预测
  // （seed=1 第二个值是 0.0027，会把卡钉在卡池第一张），丢掉再交付。
  next();
  next();
  return next;
}

/** 用字符串生成稳定种子：同一个玩家每次开局拿到的初始种子不同但可控 */
export function seedFrom(text) {
  const str = String(text == null ? "" : text);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 某个玩家的初始种子：由名字派生，保证每个人的抽卡序列从第一张就不一样。
 * 名字不变则种子不变（纯函数、可复现），撞上出厂值时换固定替补。
 */
export function initialSeedFor(name) {
  const base = seedFrom(`poker:cards:${String(name == null ? "" : name)}`);
  return base === FRESH_SEED ? 0x9e3779b9 : base;
}

/* ------------------------------------------------------------------ */
/* 状态与清洗                                                          */
/* ------------------------------------------------------------------ */

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

export function emptyPlayerCards() {
  return {
    tickets: 0,
    owned: {},
    shards: 0,
    pity3: 0,
    pity5: 0,
    pulls: 0,
    // FRESH_SEED 只表示「还没播种」，真正抽卡时由 initialSeedFor(name) 现算
    seed: FRESH_SEED,
  };
}

export function emptyCardState() {
  return { version: CARD_SCHEMA_VERSION, players: {}, log: [] };
}

/**
 * 把任意来源（老存档 / 导入 / 脏数据）洗成合法结构。
 * 认不出的卡 id 直接丢弃，避免图鉴页出现"查无此卡"。
 */
export function normalizeCardState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const playersRaw = source.players && typeof source.players === "object" ? source.players : {};

  const players = Object.keys(playersRaw).reduce((map, name) => {
    const key = String(name || "").trim();
    if (!key) return map;
    const item = playersRaw[name] && typeof playersRaw[name] === "object" ? playersRaw[name] : {};
    const ownedRaw = item.owned && typeof item.owned === "object" ? item.owned : {};

    const owned = Object.keys(ownedRaw).reduce((acc, cardId) => {
      const count = toInt(ownedRaw[cardId]);
      // 卡池里没有的 id 一律丢弃：可能是旧版本残留或手改脏数据
      if (count > 0 && cardById(cardId)) acc[cardId] = count;
      return acc;
    }, {});

    map[key] = {
      tickets: toInt(item.tickets),
      owned,
      shards: toInt(item.shards),
      pity3: toInt(item.pity3),
      pity5: toInt(item.pity5),
      pulls: toInt(item.pulls),
      seed: toInt(item.seed, 1) || 1,
    };
    return map;
  }, {});

  const log = Array.isArray(source.log)
    ? source.log
        .filter((item) => item && typeof item === "object" && cardById(item.cardId))
        .slice(0, LOG_LIMIT)
        .map((item) => ({
          time: Number(item.time) || 0,
          name: String(item.name || "").trim(),
          cardId: String(item.cardId),
          star: toInt(item.star) || 1,
          dup: toInt(item.dup),
        }))
    : [];

  return { version: CARD_SCHEMA_VERSION, players, log };
}

/** 取某个主账号的卡包，没有就给一份空的（不写回 state） */
export function playerCards(state, name) {
  const key = String(name || "").trim();
  const source = state && typeof state === "object" ? state : emptyCardState();
  const players = source.players && typeof source.players === "object" ? source.players : {};
  return players[key] || emptyPlayerCards();
}

/** 深拷贝一份 state 的浅层结构，保证 Vue 能感知到变化（不共享引用） */
function cloneState(state) {
  const base = normalizeCardState(state);
  return {
    version: CARD_SCHEMA_VERSION,
    players: { ...base.players },
    log: base.log.slice(),
  };
}

/* ------------------------------------------------------------------ */
/* 抽卡                                                                */
/* ------------------------------------------------------------------ */

/**
 * 单次抽卡的稀有度判定。
 * 顺序：5★ 硬天井 → 3★ 保底 → 常规（含软保底）。
 */
export function rollStar(rng, pity3, pity5) {
  if (pity5 + 1 >= PITY_5) return 5;

  if (pity3 + 1 >= PITY_3) {
    // 保底档位内部按 3/4/5 的原始权重重新分配
    const q = rng();
    if (q < 0.0667) return 5;
    if (q < 0.3334) return 4;
    return 3;
  }

  const soft = pity5 + 1 > SOFT_PITY_5 ? (pity5 + 1 - SOFT_PITY_5) * SOFT_PITY_STEP : 0;
  const p5 = STAR_WEIGHT[5] / 100 + soft;
  const p4 = p5 + STAR_WEIGHT[4] / 100;
  const p3 = p4 + STAR_WEIGHT[3] / 100;
  const p2 = p3 + STAR_WEIGHT[2] / 100;

  const r = rng();
  if (r < p5) return 5;
  if (r < p4) return 4;
  if (r < p3) return 3;
  if (r < p2) return 2;
  return 1;
}

/** n 抽要几张券（十连打折） */
export function costOf(n) {
  const count = Math.max(0, Math.trunc(Number(n) || 0));
  if (count >= TEN_PULL_SIZE) return TICKETS_PER_TEN;
  return count * TICKETS_PER_PULL;
}

/**
 * 抽卡。纯函数：不改传入的 state，返回新的 state。
 *
 * @param {object} state 当前卡牌存档
 * @param {string} name 主账号名
 * @param {number} count 抽几次（10 走十连价）
 * @param {{free?: boolean}} [options] free=true 时不扣券（今日结算冠军奖励走这条路）
 * @returns {{ok: boolean, need?: number, results?: Array, state: object}}
 */
export function drawCards(state, name, count = 1, options) {
  const playerName = String(name || "").trim();
  const times = Math.max(1, Math.trunc(Number(count) || 1));
  const next = cloneState(state);

  if (!playerName) return { ok: false, need: 0, results: [], state: next };

  const player = next.players[playerName] || emptyPlayerCards();
  const cost = options && options.free ? 0 : costOf(times);

  if (player.tickets < cost) {
    return { ok: false, need: cost, results: [], state: next };
  }

  // 懒播种：出厂号（seed === FRESH_SEED）第一次抽卡时才按名字生成种子，
  // 否则所有新号共用 seed=1、前几张一模一样。
  const seed = player.seed && player.seed !== FRESH_SEED
    ? player.seed
    : initialSeedFor(playerName);
  const rng = mulberry32(seed);
  const owned = { ...player.owned };
  const results = [];

  let tickets = player.tickets - cost;
  let shards = player.shards;
  let pity3 = player.pity3;
  let pity5 = player.pity5;
  let pulls = player.pulls;

  for (let i = 0; i < times; i += 1) {
    const star = rollStar(rng, pity3, pity5);
    const list = POOL_BY_STAR[star] || CARD_POOL;
    const card = list[Math.floor(rng() * list.length) % list.length];

    pity3 = star >= 3 ? 0 : pity3 + 1;
    pity5 = star === 5 ? 0 : pity5 + 1;
    pulls += 1;

    const had = (owned[card.id] || 0) > 0;
    owned[card.id] = (owned[card.id] || 0) + 1;
    const dup = had ? SHARD_OF[star] : 0;
    if (dup) shards += dup;

    results.push({ card, dup, star });
  }

  // 下限取 2：绝不能回到 FRESH_SEED(1)，否则下次抽卡会被当成新号重新播种、序列原地打转
  const nextSeed = Math.max(2, Math.floor(rng() * 2147483647));
  next.players[playerName] = {
    tickets,
    owned,
    shards,
    pity3,
    pity5,
    pulls,
    seed: nextSeed,
  };

  const time = Date.now();
  next.log = [
    ...results.map((item) => ({
      time,
      name: playerName,
      cardId: item.card.id,
      star: item.star,
      dup: item.dup,
    })),
    ...next.log,
  ].slice(0, LOG_LIMIT);

  return { ok: true, need: cost, results, state: next };
}

/* ------------------------------------------------------------------ */
/* 碎片合成                                                            */
/* ------------------------------------------------------------------ */

/**
 * 用碎片兑换一张指定卡。重复卡也能换（比如想凑第二张），但主要用途是补图鉴缺口。
 * @returns {{ok: boolean, reason?: string, state: object}}
 */
export function craftCard(state, name, cardId) {
  const playerName = String(name || "").trim();
  const next = cloneState(state);
  const card = cardById(cardId);

  if (!playerName || !card) return { ok: false, reason: "卡牌不存在", state: next };

  const player = next.players[playerName] || emptyPlayerCards();
  const cost = CRAFT_COST[card.star] || 0;

  if (player.shards < cost) {
    return { ok: false, reason: "碎片不够", state: next };
  }

  next.players[playerName] = {
    ...player,
    shards: player.shards - cost,
    owned: {
      ...player.owned,
      [card.id]: (player.owned[card.id] || 0) + 1,
    },
  };

  return { ok: true, cost, card, state: next };
}

/* ------------------------------------------------------------------ */
/* 图鉴                                                                */
/* ------------------------------------------------------------------ */

/** 某个主账号的图鉴进度 */
export function buildDex(state, name) {
  const player = playerCards(state, name);
  const items = CARD_POOL.map((card) => ({
    card,
    count: player.owned[card.id] || 0,
    owned: (player.owned[card.id] || 0) > 0,
  }));

  const byStar = STARS.reduce((map, star) => {
    const list = items.filter((item) => item.card.star === star);
    map[star] = {
      total: list.length,
      owned: list.filter((item) => item.owned).length,
    };
    return map;
  }, {});

  const ownedCount = items.filter((item) => item.owned).length;

  return {
    items,
    byStar,
    ownedCount,
    total: CARD_TOTAL,
    percent: CARD_TOTAL ? Math.round((ownedCount / CARD_TOTAL) * 1000) / 10 : 0,
    duplicates: items.reduce((sum, item) => sum + Math.max(0, item.count - 1), 0),
  };
}

/* ------------------------------------------------------------------ */
/* 奖券发放                                                            */
/* ------------------------------------------------------------------ */

/** 输光判定，与 records.js 的 isBusted 保持一致：chips <= 0 且真的亏了 */
function isBustedRecord(record, stake) {
  const chips = toCents(record.chips);
  const delta = toCents(record.delta);
  return chips <= 0 && delta < 0 && stake > 0;
}

/**
 * 把「新纪录 / 新勋章」的入参洗成 { count, titles }。
 *
 * 调用方可能给三种形态（历史上就传过数字，别指望只有一种）：
 *   - 数字：`{ 老陈: 2 }` —— 只知道几项，没有名字
 *   - 对象：`{ 老陈: { count: 2, items: [{title}] } }` —— records.js / 勋章统计的标准产出
 *   - 数组：`{ 老陈: [{title}] }`
 * 全部收敛成同一份结构，券数只能依赖 count，明细文案有就渲染、没有就退回泛化文案。
 */
function detailsOf(raw, name) {
  const value = raw[name];
  if (value == null) return { count: 0, titles: [] };
  if (Array.isArray(value)) {
    return { count: value.length, titles: titlesOf(value) };
  }
  if (typeof value === "object") {
    const items = Array.isArray(value.items) ? value.items : [];
    const count = Math.max(0, Math.trunc(Number(value.count != null ? value.count : items.length) || 0));
    return { count: count || items.length, titles: titlesOf(items) };
  }
  return { count: Math.max(0, Math.trunc(Number(value) || 0)), titles: [] };
}

/** 明细项可能是对象（{title}）也可能已经是字符串，统一取标题 */
function titlesOf(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => (item && typeof item === "object" ? item.title : item))
    .map((title) => String(title == null ? "" : title).trim())
    .filter(Boolean);
}

/**
 * 结算一局后计算每个人拿多少奖券。
 *
 * @param {object} payload
 * @param {Array} payload.records 本局结果 [{name, chips, delta, result}]
 * @param {Array} payload.players 全量玩家（用于 mainOf 归集）
 * @param {number} payload.baseChips 本局底注
 * @param {object} payload.prevBusted 上一局输光的主账号名 → true
 * @param {object} payload.newMedals 本局新点亮勋章：主账号名 → 枚数 或 {count, items}
 * @param {object} payload.newRecords 本局刷新纪录：主账号名 → 项数 或 {count, items}
 * @returns {{grants: Array<{name, tickets, reasons}>, byName: object}}
 *   reasons[].details 是明细标题（新纪录名 / 勋章名），UI 直接拼给人看
 */
export function grantTickets(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const records = Array.isArray(source.records) ? source.records : [];
  const players = Array.isArray(source.players) ? source.players : [];
  const stake = toCents(source.baseChips);
  const prevBusted = source.prevBusted && typeof source.prevBusted === "object" ? source.prevBusted : {};
  const newMedals = source.newMedals && typeof source.newMedals === "object" ? source.newMedals : {};
  const newRecords = source.newRecords && typeof source.newRecords === "object" ? source.newRecords : {};

  // 1. 归集到主账号：同组多号按"取最有利"合并，避免开小号刷券
  const groups = new Map();
  records.forEach((record) => {
    if (!record || !record.name) return;
    const name = String(record.name).trim();
    const group = mainOf(players, name) || name;
    if (!group) return;

    const cents = toCents(record.delta);
    const busted = isBustedRecord(record, stake);
    const current = groups.get(group);

    if (!current) {
      groups.set(group, {
        name: group,
        result: record.result === "win" ? "win" : record.result === "lose" ? "lose" : "deuce",
        cents,
        busted,
      });
      return;
    }

    // 同组出两个号：赢优先、金额取大、输光取真
    if (record.result === "win") current.result = "win";
    current.cents = Math.max(current.cents, cents);
    current.busted = current.busted || busted;
  });

  const grants = [];

  groups.forEach((info, group) => {
    const medalInfo = detailsOf(newMedals, group);
    const recordInfo = detailsOf(newRecords, group);
    const context = {
      ...info,
      stake,
      medals: medalInfo.count,
      medalTitles: medalInfo.titles,
      newRecords: recordInfo.count,
      recordTitles: recordInfo.titles,
      comeback: !!prevBusted[group] && info.result === "win",
    };

    const reasons = [];
    let total = 0;

    TICKET_RULES.forEach((rule) => {
      if (!rule.check(context)) return;
      const times = rule.times ? Math.max(1, rule.times(context)) : 1;
      const tickets = rule.tickets * times;
      total += tickets;
      // 一条规则可能一局算多次（勋章 / 刷新纪录按项叠加），标出来才看得懂票数怎么来的
      reasons.push({
        key: rule.key,
        label: times > 1 ? `${rule.label} ×${times}` : rule.label,
        tickets,
        detailLabel: rule.detailLabel || "",
        details: rule.details ? titlesOf(rule.details(context)) : [],
      });
    });

    if (total > 0) {
      grants.push({ name: group, tickets: total, reasons });
    }
  });

  // 名字排序稳定：不用 localeCompare（中日韩顺序在 Node 与浏览器不一致）
  grants.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const byName = grants.reduce((map, item) => {
    map[item.name] = item.tickets;
    return map;
  }, {});

  return { grants, byName };
}

/** 把奖券加到存档里（发券入口） */
export function addTickets(state, grants) {
  const next = cloneState(state);
  (Array.isArray(grants) ? grants : []).forEach((item) => {
    const name = String((item && item.name) || "").trim();
    const tickets = Math.max(0, Math.trunc(Number(item && item.tickets) || 0));
    if (!name || !tickets) return;
    const player = next.players[name] || emptyPlayerCards();
    next.players[name] = { ...player, tickets: player.tickets + tickets };
  });
  return next;
}

/** 直接设置某人的券数（调试 / 重置用） */
export function setTickets(state, name, tickets) {
  const next = cloneState(state);
  const key = String(name || "").trim();
  if (!key) return next;
  const player = next.players[key] || emptyPlayerCards();
  next.players[key] = { ...player, tickets: Math.max(0, Math.trunc(Number(tickets) || 0)) };
  return next;
}

/**
 * 合并两份卡包：券与碎片相加，卡牌张数取较大值，保底取更近的那个。
 * 改名和导入备份（merge 模式）都用这套口径。
 */
function mergePlayerCards(existing, incoming) {
  const owned = { ...existing.owned };
  Object.keys(incoming.owned || {}).forEach((id) => {
    owned[id] = Math.max(owned[id] || 0, incoming.owned[id] || 0);
  });

  return {
    tickets: existing.tickets + incoming.tickets,
    owned,
    shards: existing.shards + incoming.shards,
    pity3: Math.min(existing.pity3 || 0, incoming.pity3 || 0),
    pity5: Math.min(existing.pity5 || 0, incoming.pity5 || 0),
    pulls: existing.pulls + incoming.pulls,
    seed: existing.seed || 1,
  };
}

/** 玩家改名时把卡包一起搬过去 */
export function renameCards(state, oldName, newName) {
  const from = String(oldName || "").trim();
  const to = String(newName || "").trim();
  const next = cloneState(state);
  if (!from || !to || from === to || !next.players[from]) return next;

  next.players[to] = mergePlayerCards(
    next.players[to] || emptyPlayerCards(),
    next.players[from]
  );
  delete next.players[from];

  next.log = next.log.map((item) =>
    item.name === from ? { ...item, name: to } : item
  );

  return next;
}

/**
 * 合并两份完整存档（导入备份的 merge 模式）。
 * 按人合并，日志拼在一起后统一截断。
 */
export function mergeCardStates(base, incoming) {
  const a = normalizeCardState(base);
  const b = normalizeCardState(incoming);
  const players = { ...a.players };

  Object.keys(b.players).forEach((name) => {
    players[name] = players[name]
      ? mergePlayerCards(players[name], b.players[name])
      : b.players[name];
  });

  return {
    version: CARD_SCHEMA_VERSION,
    players,
    log: [...a.log, ...b.log]
      .sort((x, y) => y.time - x.time)
      .slice(0, LOG_LIMIT),
  };
}

/** 删号时把他的卡包一起清掉 */
export function removeCards(state, name) {
  const key = String(name || "").trim();
  const next = cloneState(state);
  if (key && next.players[key]) delete next.players[key];
  return next;
}
