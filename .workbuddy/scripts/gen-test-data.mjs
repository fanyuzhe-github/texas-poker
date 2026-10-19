/**
 * 测试数据生成器 —— 产出一份能被「导入备份」直接吃掉的 JSON。
 *
 * 用法：
 *   cd <项目根>
 *   node .workbuddy/scripts/gen-test-data.mjs
 *
 * 三条硬约束（动了就会造出自相矛盾的数据）：
 * 1. **每局零和**：sum(delta) === 0。记账工具账不平，一眼就被看穿。
 * 2. **players 由 history 重放得出**：走 ranking.applyOutcome，绝不手写 score / raceResult。
 * 3. **总积分要落在 ±100 元内**：段位只有 -10000 ~ 10000 分共 12 档（每档 20 元），
 *    一旦分数溢到 ±1000，所有人全挤在最惨 / 最强两档，段位就白做了。
 *    所以这里先定 TARGET 分数线，再用最后一局把累积精确校准到线上。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/* core 源码 import 没写 .js 后缀，Node 认不出来，先补一遍再 import */
const work = mkdtempSync(join(tmpdir(), "pkgen-"));
readdirSync(join(ROOT, "src/core"))
  .filter((f) => f.endsWith(".js"))
  .forEach((f) => copyFileSync(join(ROOT, "src/core", f), join(work, f)));
readdirSync(work).forEach((f) =>
  execFileSync("perl", ["-pi", "-e", 's/(from\\s+"\\.\\/[A-Za-z0-9_-]+)"/$1.js"/g', join(work, f)])
);

const { applyOutcome } = await import(join(work, "ranking.js"));
const { CARD_POOL } = await import(join(work, "cardPool.js"));
const { emptyCardState } = await import(join(work, "cards.js"));

/* ------------------------------------------------------------------ */
/* 演员表                                                              */
/* ------------------------------------------------------------------ */
const SEATS = [
  "老陈",
  "闹闹",
  "洋洋",
  "小聪明",
  "风沙狂舞",
  "三哥的小号",
  "糊涂蛋",
  "傻白甜",
];
const PARENT_OF = { "三哥的小号": "三哥", 糊涂蛋: "三哥", 傻白甜: "牌桌老炮" };

/**
 * 每个上桌账号的目标积分（元）。加总必须 = 0（零和）。
 * 这么排是为了让 12 档段位尽可能多地被命中：
 *   小聪明 -138 → 人形 ATM        风沙狂舞 -72 → 散财童子
 *   牌桌老炮 -35 → 资深韭菜       洋洋 +15 → 小富即安
 *   闹闹 +45 → 牌桌新贵           老陈 +70 → 割韭狂魔
 *   三哥 +115（两号汇总）→ 赌神下凡
 */
const TARGET = {
  小聪明: -138,
  风沙狂舞: -72,
  傻白甜: -35,
  洋洋: 15,
  闹闹: 45,
  老陈: 70,
  "三哥的小号": 72,
  糊涂蛋: 43,
};

/* ------------------------------------------------------------------ */
/* 局势生成                                                            */
/* ------------------------------------------------------------------ */
const rnd = (() => {
  let s = 20261018;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
})();

const yuan2cents = (v) => Math.round(v * 100);

/**
 * 造一局。
 * @param {object} o
 * @param {number} o.base 底注（元）
 * @param {string[]} o.seats 上桌名单
 * @param {string} o.winner 赢家
 * @param {number} o.keep 输家保留筹码的比例（0=接近输光，1=回本打平）
 * @param {string[]} o.bust 直接清零的人
 */
function makeRound(time, { base, seats, winner, keep = 0.5, bust = [] }) {
  const baseCents = yuan2cents(base);
  const total = seats.length * baseCents;
  const chips = new Map(seats.map((n) => [n, 0]));

  bust.forEach((n) => chips.set(n, 0));

  const losers = seats.filter((n) => n !== winner && !bust.includes(n));
  let used = 0;
  losers.forEach((n) => {
    const v = Math.round(baseCents * keep);
    chips.set(n, v);
    used += v;
  });
  chips.set(winner, total - used);

  const rows = seats.map((name, i) => ({
    name,
    seatNum: i + 1,
    chipsCents: chips.get(name),
  }));
  return { time, base, rows };
}

/** 把 m 个名额按「最接近 1 的概率」取整地把一串数调成和 sum 相等 */
function seedFor(year, month, day, hour = 21, min = 20) {
  return new Date(year, month - 1, day, hour, min, 0, 0).getTime();
}

/**
 * 日程表：横跨一个冬季（含跨年）→ 春 → 夏 → 秋（当前）。
 * 刻意压缩在 22 局：段位只有 ±100 元共 12 档，局数一多，
 * 积分必然溢出到 ±1000，所有人挤在最惨 / 最强两档，段位就失去意义。
 */
const SCHEDULE = [
  // 2025 冬：12 月与次年 1、2 月同属这一年，验证 season 的跨年归季
  [2025, 11, 22], [2025, 12, 6], [2025, 12, 20], [2026, 1, 10], [2026, 2, 7],
  // 2026 春：老陈五连胜
  [2026, 3, 7], [2026, 3, 21], [2026, 4, 11], [2026, 4, 25], [2026, 5, 9], [2026, 5, 23],
  // 2026 夏：小聪明连败到翻盘
  [2026, 6, 6], [2026, 6, 27], [2026, 7, 18], [2026, 8, 8], [2026, 8, 29],
  // 2026 秋：进行中
  [2026, 9, 12], [2026, 9, 26], [2026, 10, 3], [2026, 10, 10], [2026, 10, 15], [2026, 10, 17],
];
/** 今日一局：既是「今天刚打完」，也用来把积分校准到目标线 */
const TODAY = [2026, 10, 18];

/**
 * 剧本：谁在哪局赢。刻意埋三种走势，把连胜 / 连败 / 翻盘的勋章和纪录都点起来。
 * 没写到的位置由 pickWinner 贪心补齐（选离目标线还差最多的人）。
 */
const WINNER_PLAN = {
  0: "三哥的小号", 1: "糊涂蛋", 2: "老陈", 3: "三哥的小号", 4: "闹闹",
  5: "糊涂蛋",
  6: "老陈", 7: "老陈", 8: "老陈", 9: "老陈", 10: "老陈", // 春末五连胜
  11: "三哥的小号", 12: "洋洋", 13: "糊涂蛋",
  14: "小聪明", // 上一局刚被打光 → 翻盘王 + 不死小强
  15: "老陈",
  16: "三哥的小号", 17: "闹闹", 18: "糊涂蛋", 19: "傻白甜", 20: "老陈", 21: "风沙狂舞",
};
/** 碾压局：赢家一次吃掉大半桌，把「碾压王」「单局最高积分」抬出区分度 */
const CRUSH_ROUNDS = new Set([3, 8, 17]);

const acc = new Map(SEATS.map((n) => [n, 0])); // 累计 delta（分）
const PLAN = [];

/**
 * 贪心挑人：谁离目标线还差得最多，谁这局就赢。
 * 这样 27 局跑完，累积自然收束到 TARGET 附近，最后一局只需微调。
 */
function pickWinner(seats) {
  return seats.reduce((best, n) =>
    TARGET[n] * 100 - acc.get(n) > TARGET[best] * 100 - acc.get(best) ? n : best
  );
}
/** 谁还没输到目标线，谁就可能继续输光 —— 输光会自然集中在最惨的那几个人身上 */
function pickBust(seats, winner) {
  const pool = seats
    .filter((n) => n !== winner)
    .filter((n) => acc.get(n) > TARGET[n] * 100 + 300) // 离目标还差 3 元以上
    .sort((a, b) => TARGET[a] - TARGET[b]);
  return pool.slice(0, Math.min(pool.length, Math.round(rnd() * 2.2)));
}

SCHEDULE.forEach(([y, m, d], i) => {
  // 每局随机缺席 0~2 人，出勤率图表才有起伏
  const absent = SEATS.filter(() => rnd() < 0.1).slice(0, 2);
  const seats = SEATS.filter((n) => !absent.includes(n));

  const planned = WINNER_PLAN[i];
  // 剧本里的人今天没来，才让贪心顶上
  const winner = planned && seats.includes(planned) ? planned : pickWinner(seats);
  const bust = pickBust(seats, winner);

  // 常规局刻意温和（keep 高 → 输家只小亏），否则 22 局下来积分会溢出段位区间；
  // 只有碾压局把 keep 压低，给「碾压王 / 单局最高积分」留出区分度。
  const crush = CRUSH_ROUNDS.has(i);
  const keep = crush ? 0.25 : 0.8 + rnd() * 0.12;

  const r = makeRound(seedFor(y, m, d), { base: 10, seats, winner, keep, bust });
  rowsIntoAcc(r);
  PLAN.push(r);
});

function rowsIntoAcc(r) {
  r.rows.forEach((row) => {
    acc.set(row.name, acc.get(row.name) + row.chipsCents - yuan2cents(r.base));
  });
}

/*
 * --- 收官局：只把分数凑整到「元」，不再强行拉 TARGET ---
 *
 * 曾经的做法是硬拉到预设分数线，结果最后一局被抬到 90 元底注、
 * 凭空造出一个 -82 的「单局最惨」，既突兀又污染今日结算。
 * 现在改成：22 局自然累积出来的分布本身就足够分散（跨 7~8 个段位档），
 * 收官局只需把角分抹平成整数，校准量不到 1 元，仍是一局普通的 10 元底注。
 */
{
  const base = 10;
  const baseCents = yuan2cents(base);

  // 抹到整「元」（100 分）
  const aim = new Map(SEATS.map((n) => [n, Math.round(acc.get(n) / 100) * 100]));
  // 抹平会破坏零和，把零头补给累计波动最大的那个人，账继续平
  const drift = SEATS.reduce((s, n) => s + aim.get(n), 0);
  if (drift !== 0) {
    const anchor = SEATS.reduce((a, b) => (Math.abs(acc.get(b)) > Math.abs(acc.get(a)) ? b : a));
    aim.set(anchor, aim.get(anchor) - drift);
  }

  const deltas = SEATS.map((n) => aim.get(n) - acc.get(n));
  const sumDelta = deltas.reduce((a, b) => a + b, 0);
  if (sumDelta !== 0) throw new Error(`收官局零和不平：${sumDelta} 分`);
  if (Math.max(...deltas.map(Math.abs)) > baseCents) {
    throw new Error(`收官局校准量 ${Math.max(...deltas.map(Math.abs))} 分超过底注，需要提高 base`);
  }

  const rows = SEATS.map((name, i) => ({
    name,
    seatNum: i + 1,
    chipsCents: baseCents + deltas[i],
  }));
  rows.forEach((row) => {
    if (row.chipsCents < 0) throw new Error(`${row.name} 收官后筹码为负：${row.chipsCents} 分`);
  });

  PLAN.push({ time: seedFor(...TODAY, 20, 40), base, rows });
}

/* ------------------------------------------------------------------ */
/* 落成 history，并用 applyOutcome 重放 players                         */
/* ------------------------------------------------------------------ */
const history = PLAN.map((r, i) => ({
  id: `t${String(2000 + i)}`,
  time: r.time,
  baseChips: r.base,
  records: r.rows.map((row) => {
    const deltaCents = row.chipsCents - yuan2cents(r.base);
    return {
      name: row.name,
      seatNum: row.seatNum,
      chips: row.chipsCents / 100,
      delta: deltaCents / 100,
      result: deltaCents > 0 ? "win" : deltaCents < 0 ? "lose" : "deuce",
    };
  }),
  transfers: [],
}));

history.forEach((g) => {
  const sum = g.records.reduce((a, r) => a + Math.round(r.delta * 100), 0);
  if (sum !== 0) throw new Error(`第 ${g.id} 局零和不成立，差额 ${sum} 分`);
});

const initialPlayers = [
  ...["三哥", "牌桌老炮"].map((name) => ({
    seatNum: 0, name, parent: null, isMain: true, chips: 0, score: 0,
    raceResult: { win: 0, lose: 0, deuce: 0 }, raceDate: Date.now(),
    avatar: "", lastState: "deuce", stateTimes: 0,
  })),
  ...SEATS.map((name, i) => ({
    seatNum: i + 1, name, parent: PARENT_OF[name] || null, isMain: false,
    chips: 0, score: 0, raceResult: { win: 0, lose: 0, deuce: 0 },
    raceDate: Date.now(), avatar: "", lastState: "deuce", stateTimes: 0,
  })),
];

// 必须按时间正序重放，倒序会把 lastState / stateTimes 算反
let players = initialPlayers;
[...history].sort((a, b) => a.time - b.time).forEach((g) => {
  players = applyOutcome(players, g.records);
});

/* ------------------------------------------------------------------ */
/* 卡包：头像选择器 / 碎片合成 / 近空态 三种边界都要覆盖到                */
/* ------------------------------------------------------------------ */
const ids = CARD_POOL.map((c) => c.id);
const OWNER = {
  三哥: 34, 牌桌老炮: 22, 老陈: 18, 闹闹: 12,
  洋洋: 7, 小聪明: 2, 风沙狂舞: 9,
};
const TICKETS = { 三哥: 33, 牌桌老炮: 24, 老陈: 19, 闹闹: 14, 洋洋: 8, 小聪明: 5, 风沙狂舞: 11 };

let cards = emptyCardState();
Object.entries(OWNER).forEach(([name, count], ownerIndex) => {
  const owned = {};
  // 错位取卡，别全卡在 1★，图鉴页才看得出高低星混排
  for (let i = 0; i < count; i += 1) {
    const id = ids[(i * 2 + ownerIndex * 5) % ids.length];
    owned[id] = (owned[id] || 0) + 1;
  }
  cards.players[name] = {
    tickets: TICKETS[name],
    owned,
    shards: 40 + ownerIndex * 15,
    pity3: ownerIndex % 7,
    pity5: ownerIndex * 4,
    pulls: count + ownerIndex * 3,
    seed: 1000 + ownerIndex * 137,
  };
});

// 让两个人真的戴着卡头像，验证「严格按拥有」的解锁链路（必须是 owned 里实有的 id）
const avatarPair = [["三哥的小号", "三哥", ids[30]], ["老陈", "老陈", ids[5]]];
avatarPair.forEach(([playerName, ownerName, cardId]) => {
  cards.players[ownerName].owned[cardId] = (cards.players[ownerName].owned[cardId] || 0) + 1;
  players = players.map((p) => (p.name === playerName ? { ...p, avatar: `card:${cardId}` } : p));
});

/* ------------------------------------------------------------------ */
/* 输出                                                               */
/* ------------------------------------------------------------------ */
const backup = {
  app: "texas-poker",
  version: 4,
  exportedAt: new Date().toISOString(),
  players,
  history,
  settings: { version: 4, baseChips: 10 },
  cards,
};

const outDir = join(ROOT, ".workbuddy/testdata");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "poker-test-data.json");
writeFileSync(outFile, JSON.stringify(backup, null, 2), "utf8");

console.log(`已生成 ${outFile}`);
console.log(`  流水 ${history.length} 局 / 玩家 ${players.length} 人（含 2 个主账号）`);
console.log(`  跨度 ${new Date(history[0].time).toLocaleDateString("zh-CN")} → ${new Date(history[history.length - 1].time).toLocaleDateString("zh-CN")}`);
