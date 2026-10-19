/**
 * 连胜 / 连败统计（纯函数，方便单测）。
 *
 * 改动前务必先读这四条口径，它们是为了和别处保持一致才这么定的：
 *
 * 1. 结果类型取流水里的 `record.result`（win / lose / deuce），**不用 delta 的正负推导** ——
 *    平分彩池时会出现「判胜但 delta = 0」。只有脏数据（没有 result 字段）才回落到金额符号。
 * 2. 平局既不算连胜也不算连败，而且**不打断**当前的连胜 / 连败状态。
 *    这与 ranking.applyOutcome 的处理一致（那边遇到 deuce 也是直接跳过、不改状态）。
 * 3. 归集口径同总榜：上桌的是子账号，战绩一律用 mainOf() 归到主账号头上。
 * 4. 金额全程走 money.js 的整数「分」，不在这一层裸写浮点运算。
 */
import { toCents, fromCents } from "./money";
import { mainOf } from "./ranking";
import { sortByTime, formatClock } from "./stats";

/** 近况格子最多画多少场 */
export const RECENT_LIMIT = 12;

/** 单局结果的说法 */
export const RESULT_LABEL = { win: "胜", lose: "负", deuce: "平" };

/** 连续战绩的说法：顺着国内扑克玩家「三连胜 / 两连败」的口吻，不要写成「2连负」 */
export const STREAK_LABEL = { win: "连胜", lose: "连败" };

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 归一化的结果类型：优先信任流水记录的 result，脏数据才回落到金额符号 */
export function resultType(record) {
  const raw = record && record.result;
  if (raw === "win" || raw === "lose" || raw === "deuce") return raw;
  const cents = record ? toCents(record.delta) : 0;
  if (cents > 0) return "win";
  if (cents < 0) return "lose";
  return "deuce";
}

/**
 * 同一局里同一主账号合并后的结果。
 * 正常情况下 limitOnePerMain 已经挡住了「一个人出两个号」，这里是兜底：
 * 有胜有负时按合计金额的正负裁决，全平才算平。
 */
function mergedType(entry) {
  if (entry.wins && !entry.loses) return "win";
  if (entry.loses && !entry.wins) return "lose";
  if (entry.cents > 0) return "win";
  if (entry.cents < 0) return "lose";
  return "deuce";
}

/**
 * 按时间正序还原每个「主账号」的战绩序列。
 *
 * @returns {Array<{name:string, items:Array<{round:number,time:number,result:string,cents:number}>}>}
 */
export function buildStreakSequences(history, players) {
  const rounds = sortByTime(history);
  const roster = Array.isArray(players) ? players : [];
  const table = new Map();

  rounds.forEach((round, index) => {
    const merged = new Map();

    (round.records || []).forEach((record) => {
      if (!record || !record.name) return;
      const group = mainOf(roster, record.name);
      const entry = merged.get(group) || {
        cents: 0,
        wins: 0,
        loses: 0,
        deuces: 0,
      };
      const type = resultType(record);
      entry.cents += toCents(record.delta);
      entry[type] += 1;
      merged.set(group, entry);
    });

    merged.forEach((entry, group) => {
      if (!table.has(group)) table.set(group, []);
      table.get(group).push({
        round: index + 1,
        time: toInt(round.time),
        result: mergedType(entry),
        cents: entry.cents,
      });
    });
  });

  return Array.from(table.entries()).map(([name, items]) => ({ name, items }));
}

/**
 * 把一段战绩序列折叠成连续的「连胜段 / 连败段」。
 * 平局被直接跳过（不打断当前段），只在 `deuces` 里记个数，方便排查。
 *
 * @returns {Array<{type:string,times:number,cents:number,deuces:number,
 *                  startRound:number,endRound:number,startTime:number,endTime:number}>}
 */
export function foldStreakRuns(items) {
  const runs = [];
  let current = null;

  (items || []).forEach((item) => {
    if (item.result === "deuce") {
      if (current) current.deuces += 1;
      return;
    }
    if (current && current.type === item.result) {
      current.times += 1;
      current.cents += item.cents;
      current.endRound = item.round;
      current.endTime = item.time;
      return;
    }
    current = {
      type: item.result,
      times: 1,
      cents: item.cents,
      deuces: 0,
      startRound: item.round,
      startTime: item.time,
      endRound: item.round,
      endTime: item.time,
    };
    runs.push(current);
  });

  return runs;
}

function pickRun(runs, better) {
  return runs.reduce((acc, run) => (acc && !better(run, acc) ? acc : run), null);
}

/**
 * 连胜榜：每个主账号一段档案。
 *
 * @returns {Array<{name, games, runs, recent, current, longestWin, longestLose, bestRun, worstRun}>}
 *   current    —— 正在进行的一段（最后一段非平局战绩）
 *   longestWin —— 场数最长的一段连胜；bestRun 是那段里**赚钱最多**的一段
 *   longestLose / worstRun 同理
 */
export function buildStreakBoard(history, players) {
  return buildStreakSequences(history, players)
    .map(({ name, items }) => {
      const runs = foldStreakRuns(items);
      const ofType = (type) => runs.filter((run) => run.type === type);
      const winRuns = ofType("win");
      const loseRuns = ofType("lose");

      return {
        name,
        games: items.length,
        runs,
        recent: items.slice(-RECENT_LIMIT).map((item) => ({
          round: item.round,
          result: item.result,
          delta: fromCents(item.cents),
          time: formatClock(item.time),
        })),
        current: runs.length ? runs[runs.length - 1] : null,
        longestWin: pickRun(winRuns, (a, b) => a.times > b.times),
        longestLose: pickRun(loseRuns, (a, b) => a.times > b.times),
        bestRun: pickRun(winRuns, (a, b) => a.cents > b.cents),
        worstRun: pickRun(loseRuns, (a, b) => a.cents < b.cents),
      };
    })
    .sort(compareStreak);
}

/** 连胜的排前面，同类型场次多的排前面 */
function compareStreak(a, b) {
  const ca = a.current;
  const cb = b.current;
  if (!ca && !cb) return b.games - a.games;
  if (!ca) return 1;
  if (!cb) return -1;
  if (ca.type !== cb.type) return ca.type === "win" ? -1 : 1;
  if (cb.times !== ca.times) return cb.times - ca.times;
  return Math.abs(cb.cents) - Math.abs(ca.cents);
}

/**
 * 全局摘要：正在连胜最猛的、正在连败最惨的、史上最长的一段连胜。
 * @returns {{hot:object|null, cold:object|null, best:object|null}}
 *   每个都是 {name, run} 的形状，方便 UI 直接取值。
 */
export function buildStreakSummary(board) {
  const rows = Array.isArray(board) ? board : [];
  const bestOf = (predicate, compare) =>
    rows
      .filter((row) => row.current && predicate(row.current))
      .reduce(
        (acc, row) => (!acc || compare(row.current, acc.run) ? { name: row.name, run: row.current } : acc),
        null
      );

  const best = rows.reduce((acc, row) => {
    const run = row.longestWin;
    if (!run) return acc;
    if (!acc) return { name: row.name, run };
    // 先比场次，场次相同比赚的金额
    if (run.times > acc.run.times) return { name: row.name, run };
    if (run.times === acc.run.times && run.cents > acc.run.cents)
      return { name: row.name, run };
    return acc;
  }, null);

  return {
    hot: bestOf((run) => run.type === "win", (a, b) => a.times > b.times),
    cold: bestOf((run) => run.type === "lose", (a, b) => a.times > b.times),
    best,
  };
}

/** 一段战绩的可读文本：「3连胜」/「2连败」/「—」 */
export function formatStreak(run) {
  if (!run || !run.times) return "—";
  const label = STREAK_LABEL[run.type];
  return label ? `${run.times}${label}` : `${run.times}连${RESULT_LABEL[run.type]}`;
}
