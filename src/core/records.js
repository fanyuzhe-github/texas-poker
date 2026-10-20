/**
 * 记录榜 —— 十四项「历史之最」，分三组：
 * 高光时刻（赢）· 至暗时刻（输）· 韧性时刻（过程）。
 *
 * 注 1：曾经还有一组「铁人出勤」（出勤王 / 连续出勤天数 / 元老），用户已要求去掉，
 * 别再把它加回来。
 * 注 2：「当日最高积分」也已按用户要求删除（它跟「单局最高积分」高度重复，
 * 谁赢的局多谁就占着，信息量不大）。**别再加回「当日」类积分记录**；
 * 至暗时刻的「当日最惨」是用户明确保留的，不受影响。
 * 注 3：「最长不输光」也已删除 —— 开局那几局人人都是「N 局没输光」，并列一大片，
 * 谁打得多谁占着，信息量还不如输光次数。韧性时刻**别再加"没发生过的坏事累计多久"
 * 这类口径**（连续不输光 / 连续不上桌 … 都是同一毛病）。
 *
 * 设计约定（改动前必读）：
 *
 * 1. **归集口径同总榜**：上桌的是子账号，记录一律用 `mainOf()` 归到主账号头上。
 *    同一局里同组出现两个号时按合计金额参与比较（与 season.js / stats.js 一致）。
 * 2. **金额全程走整数「分」**，只在最后一步 `fromCents()` 转回元，避免浮点脏值。
 * 3. **胜率有准入门槛** `RATE_MIN_GAMES`：1 局 1 胜就是 100%，样本太少没有意义。
 *    没人达标时该条记录的 `leader` 为 null，由 UI 显示空态 + 门槛说明，不要硬塞一个人上去。
 * 4. **输光判定**：结算后剩余筹码 <= 0 **且** 这一局是亏的。
 *    只判 `chips <= 0` 会在底注为 0 的脏数据里把所有人误判成输光。
 * 5. 每条记录都带一份 `board`（前 BOARD_SIZE 名挑战者），不只是冠军一个人。
 * 6. **「最惨」类只收确实亏了的**（`cents < 0`）：单局最惨 / 当日最惨 / 最惨连败都一样。
 *    否则一个从没输过的人会以「+1.00」登上「单局最惨」榜，很荒谬。没输过的人不进榜。
 * 7. **翻盘王必须是「输光的下一局」且真的赢回来**（`cents > 0`）。
 *    不限定「下一局」的话，它就退化成变相的单局最高积分了。
 * 8. **碾压王 = 单局领先第二名最多**：必须同桌至少两个主账号、本人真的赢到钱
 *    （`top > 0`）且与次席拉开差距（`margin > 0`），否则「一人摆一桌」「两人并列双赢」
 *    都会刷出一条 +0.00 的空头纪录。它补的是「单局最高积分」看不出来的统治力：
 *    大桌子人多，绝对值天然更容易刷高，碾压幅度才是真本事。
 * 9. **最猛一波取 streak 的 `bestRun`**（连胜段里赚钱最多的那段），不是 `longestWin`；
 *    「最高连胜」看场数，这一项看那段一共赢走了多少钱。那段没真赚到钱不上榜。
 * 10. **不死小强 = 翻盘的「次数」**（翻盘王是单次金额）：一次都没爬起来的不进榜，
 *    否则开局「0 次」会占满前排，跟删掉的「最长不输光」一个毛病。
 * 11. **连败终结者的触发是「连败」不是「输光」**：大部分输局并没输光，那部分反弹
 *    以前没人记。至少熬过 `BREAK_MIN_LOSE` 场连败才算，1 连败就止跌不算苦尽甘来；
 *    平局不打断连败计数（与 streak.js 同口径）。
 * 12. **奖券只发给「单局发生的事」**（`ticket: true`）：单局最高积分 / 碾压王 /
 *    单局最惨 / 翻盘王 / 连败终结者。累计型记录（赛季·当日·连胜·连败·输光次数·
 *    胜率·最猛一波·不死小强）**一律 `ticket: false`** —— 它们只要又打一局数值就
 *    会自然变大，每局都判"刷新"会让奖券通胀（实测第二局跟第一局打一样也发 40 券）。
 *    新加记录项时先想清楚它是"这一局发生的事"还是"攒出来的"，攒出来的不要发券。
 *
 * 依赖方向：records → season → streak → stats，单向无环。
 * 所以 stats.js / streak.js / season.js **都不能反过来 import 本文件**。
 */

import { toCents, fromCents, formatSigned } from "./money.js";
import { mainOf } from "./ranking.js";
import { sortByTime, formatClock } from "./stats.js";
import { listSeasons, buildSeasonReport } from "./season.js";
import {
  buildStreakBoard,
  buildStreakSequences,
  formatStreak,
} from "./streak.js";

/** 胜率榜准入门槛（局数） */
export const RATE_MIN_GAMES = 5;

/** 每张记录卡下面带几名挑战者 */
export const BOARD_SIZE = 5;

/** 「连败终结者」至少得熬过这么长的连败（1 连败就止跌不算苦尽甘来） */
export const BREAK_MIN_LOSE = 2;

function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * 兜底排序用的名字比较。
 * 别用 `localeCompare`：中日的排序规则在 Node 与各浏览器里并不一致
 * （同一批名字可能一边按拼音、一边按 Unicode 码点），会导致并列时的名次抖动。
 * 这里统一按码点比，跨环境结果稳定。
 */
function compareName(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** 本地自然日 key：YYYY-MM-DD */
function dayKey(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

/** 自然日的可读文本：10-16 */
function dayLabel(key) {
  const parts = String(key || "").split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : "—";
}

/** 一局里各主账号的合计盈亏（分）。同组多号按合计，与总榜口径一致 */
function groupTotalsOf(round, groupOf) {
  const totals = new Map();
  (round.records || []).forEach((record) => {
    const group = groupOf(record.name);
    if (!group) return;
    totals.set(group, (totals.get(group) || 0) + toCents(record.delta));
  });
  return totals;
}

/**
 * 一局里各主账号的「合计盈亏 + 是否有人输光」。
 * 同组出两个号时：金额按合计，输光按「任一号被打光」算。
 */
function groupStatsOf(round, groupOf) {
  const stats = new Map();
  (round.records || []).forEach((record) => {
    const group = groupOf(record.name);
    if (!group) return;
    const item = stats.get(group) || { cents: 0, busted: false };
    item.cents += toCents(record.delta);
    if (isBusted(record)) item.busted = true;
    stats.set(group, item);
  });
  return stats;
}

/** 输光判定：筹码清零且这一局是亏的（见文件顶部约定 4） */
function isBusted(record) {
  return toCents(record.chips) <= 0 && toCents(record.delta) < 0;
}

/** 把 Map 转成按 value 降序的 rows */
function toRows(map, shape, compare = (a, b) => b.value - a.value) {
  const rows = [];
  map.forEach((payload, name) => {
    const row = shape(payload, name);
    if (row) rows.push({ name, ...row });
  });
  return rows.sort(compare);
}

/* ------------------------------------------------------------------ */
/* 1. 单局最高积分                                                       */
/* ------------------------------------------------------------------ */

function collectBestRound(rounds, groupOf) {
  const best = new Map();
  rounds.forEach((round, index) => {
    groupTotalsOf(round, groupOf).forEach((cents, group) => {
      const prev = best.get(group);
      if (!prev || cents > prev.cents) {
        best.set(group, { cents, round: index + 1, time: round.time });
      }
    });
  });

  return toRows(best, (payload) => ({
    value: fromCents(payload.cents),
    text: formatSigned(fromCents(payload.cents)),
    detail: `第 ${payload.round} 局 · ${formatClock(payload.time)}`,
  }));
}

/* ------------------------------------------------------------------ */
/* 2. 碾压王：一局打完，领先第二名最多的一次                              */
/* ------------------------------------------------------------------ */

function collectBiggestLead(rounds, groupOf) {
  const best = new Map();

  rounds.forEach((round, index) => {
    const totals = groupTotalsOf(round, groupOf);
    // 至少两个主账号同桌才谈得上「碾压」；一人摆一桌不算
    if (totals.size < 2) return;

    const sorted = Array.from(totals.values()).sort((a, b) => b - a);
    const top = sorted[0];
    const second = sorted[1];
    const margin = top - second;
    // 本人得真赢到钱，且与次席确实有差距（并列双赢刷不出纪录）
    if (top <= 0 || margin <= 0) return;

    totals.forEach((cents, group) => {
      if (cents !== top) return;
      const prev = best.get(group);
      if (!prev || margin > prev.margin) {
        best.set(group, {
          margin,
          cents: top,
          second,
          round: index + 1,
        });
      }
    });
  });

  return toRows(best, (payload) => ({
    value: fromCents(payload.margin),
    text: formatSigned(fromCents(payload.margin)),
    detail: `第 ${payload.round} 局 · 全场 ${formatSigned(
      fromCents(payload.cents)
    )} / 次席 ${formatSigned(fromCents(payload.second))}`,
  }));
}

/* ------------------------------------------------------------------ */
/* 3. 赛季最高积分                                                       */
/* ------------------------------------------------------------------ */

function collectBestSeason(history, roster) {
  const seasons = listSeasons(history);
  const best = new Map();

  seasons.forEach((season) => {
    const report = buildSeasonReport(history, roster, season);
    (report.ranking || []).forEach((row) => {
      const cents = toCents(row.score);
      const prev = best.get(row.name);
      if (!prev || cents > prev.cents) {
        best.set(row.name, {
          cents,
          season: season.label,
          games: row.games,
        });
      }
    });
  });

  return toRows(best, (payload) => ({
    value: fromCents(payload.cents),
    text: formatSigned(fromCents(payload.cents)),
    detail: `${payload.season} · ${payload.games} 局`,
  }));
}

/* ------------------------------------------------------------------ */
/* 4. 最高连胜                                                           */
/* ------------------------------------------------------------------ */

function collectLongestStreak(history, roster) {
  const board = buildStreakBoard(history, roster);
  const rows = [];

  board.forEach((row) => {
    const run = row.longestWin;
    if (!run || !run.times) return;
    rows.push({
      name: row.name,
      value: run.times,
      cents: run.cents,
      text: formatStreak(run),
      detail:
        run.startRound === run.endRound
          ? `第 ${run.startRound} 局 · ${formatSigned(fromCents(run.cents))}`
          : `第 ${run.startRound}-${run.endRound} 局 · ${formatSigned(
              fromCents(run.cents)
            )}`,
    });
  });

  // 先比连胜场数，相同再比那段赚的钱
  return rows.sort((a, b) => b.value - a.value || b.cents - a.cents);
}

/* ------------------------------------------------------------------ */
/* 5. 最猛一波：连胜里赚得最多的那一段（与「最高连胜」看场数互补）          */
/* ------------------------------------------------------------------ */

function collectBestRunMoney(history, roster) {
  const board = buildStreakBoard(history, roster);
  const rows = [];

  board.forEach((row) => {
    const run = row.bestRun;
    // 从没赢过、或那段一分没赚到（平分彩池会判胜但 delta=0）的不上高光榜
    if (!run || !run.times || run.cents <= 0) return;
    rows.push({
      name: row.name,
      value: fromCents(run.cents),
      text: formatSigned(fromCents(run.cents)),
      detail: `${formatStreak(run)} · 第 ${run.startRound}-${run.endRound} 局`,
    });
  });

  return rows.sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* 6. 最高胜率（有局数门槛）                                              */
/* ------------------------------------------------------------------ */

function collectBestRate(rounds, groupOf) {
  const stats = new Map();
  rounds.forEach((round) => {
    (round.records || []).forEach((record) => {
      const group = groupOf(record.name);
      if (!group) return;
      const stat = stats.get(group) || {
        win: 0,
        lose: 0,
        deuce: 0,
        games: 0,
      };
      stat.games += 1;
      if (record.result === "win") stat.win += 1;
      else if (record.result === "lose") stat.lose += 1;
      else stat.deuce += 1;
      stats.set(group, stat);
    });
  });

  return toRows(
    stats,
    (stat) => {
      // 平局计入分母，与 ranking.formatWinRate 口径一致
      if (stat.games < RATE_MIN_GAMES) return null;
      const rate = stat.win / stat.games;
      return {
        value: rate,
        text: `${(rate * 100).toFixed(1)}%`,
        games: stat.games,
        detail: `${stat.games} 局 · ${stat.win}胜${stat.lose}负${
          stat.deuce ? `${stat.deuce}平` : ""
        }`,
      };
    },
    // 胜率相同时样本更足的排前面，最后才按名字兜底（保证顺序稳定）
    (a, b) => b.value - a.value || b.games - a.games || compareName(a.name, b.name)
  );
}

/* ------------------------------------------------------------------ */
/* 7. 最多输光次数                                                       */
/* ------------------------------------------------------------------ */

function collectMostBusted(rounds, groupOf) {
  const busted = new Map();
  const played = new Map();

  rounds.forEach((round) => {
    (round.records || []).forEach((record) => {
      const group = groupOf(record.name);
      if (!group) return;
      played.set(group, (played.get(group) || 0) + 1);
      if (isBusted(record)) {
        busted.set(group, (busted.get(group) || 0) + 1);
      }
    });
  });

  const rows = [];
  busted.forEach((times, name) => {
    rows.push({
      name,
      value: times,
      text: `${times} 次`,
      detail: `共 ${played.get(name) || 0} 局 · 输光率 ${(
        (times / (played.get(name) || 1)) *
        100
      ).toFixed(0)}%`,
    });
  });

  return rows.sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* 8. 单局最惨（补对称：有「最高」就该有「最惨」）                         */
/* ------------------------------------------------------------------ */

function collectWorstRound(rounds, groupOf) {
  const worst = new Map();
  rounds.forEach((round, index) => {
    groupTotalsOf(round, groupOf).forEach((cents, group) => {
      // 只收确实亏了的局：从未输过的人不该登上「最惨」榜
      if (cents >= 0) return;
      const prev = worst.get(group);
      if (!prev || cents < prev.cents) {
        worst.set(group, { cents, round: index + 1, time: round.time });
      }
    });
  });

  return toRows(
    worst,
    (payload) => ({
      value: fromCents(payload.cents),
      text: formatSigned(fromCents(payload.cents)),
      detail: `第 ${payload.round} 局 · ${formatClock(payload.time)}`,
    }),
    // value 是负数，亏得最多的排最前
    (a, b) => a.value - b.value
  );
}

/* ------------------------------------------------------------------ */
/* 9. 当日最惨                                                           */
/* ------------------------------------------------------------------ */

function collectWorstDay(rounds, groupOf) {
  const days = new Map();
  rounds.forEach((round) => {
    const key = dayKey(round.time);
    if (!key) return;
    groupTotalsOf(round, groupOf).forEach((cents, group) => {
      const id = `${group}|${key}`;
      const prev = days.get(id);
      if (prev) {
        prev.cents += cents;
        prev.games += 1;
      } else {
        days.set(id, { cents, games: 1, day: key, group });
      }
    });
  });

  const worst = new Map();
  days.forEach((payload) => {
    if (payload.cents >= 0) return;
    const prev = worst.get(payload.group);
    if (!prev || payload.cents < prev.cents) {
      worst.set(payload.group, payload);
    }
  });

  return toRows(
    worst,
    (payload) => ({
      value: fromCents(payload.cents),
      text: formatSigned(fromCents(payload.cents)),
      detail: `${dayLabel(payload.day)} · ${payload.games} 局`,
    }),
    (a, b) => a.value - b.value
  );
}

/* ------------------------------------------------------------------ */
/* 10. 最长连败（局数最多的一段连败）                                      */
/* ------------------------------------------------------------------ */

function collectLongestLose(history, roster) {
  const board = buildStreakBoard(history, roster);
  const rows = [];

  board.forEach((row) => {
    const run = row.longestLose;
    if (!run || !run.times) return;
    rows.push({
      name: row.name,
      value: run.times,
      cents: run.cents,
      text: formatStreak(run),
      detail:
        run.startRound === run.endRound
          ? `第 ${run.startRound} 局 · ${formatSigned(fromCents(run.cents))}`
          : `第 ${run.startRound}-${run.endRound} 局 · ${formatSigned(
              fromCents(run.cents)
            )}`,
    });
  });

  // 场数相同则亏得更多的排前面
  return rows.sort((a, b) => b.value - a.value || a.cents - b.cents);
}

/* ------------------------------------------------------------------ */
/* 11. 最惨连败（亏得最多的那一段，与「最长连败」不是一回事）              */
/* ------------------------------------------------------------------ */

function collectWorstStreak(history, roster) {
  const board = buildStreakBoard(history, roster);
  const rows = [];

  board.forEach((row) => {
    const run = row.worstRun;
    if (!run || !run.times || run.cents >= 0) return;
    rows.push({
      name: row.name,
      // value 统一用「元」，与其它记录项保持一致（内部计算仍是整数分）
      value: fromCents(run.cents),
      text: formatSigned(fromCents(run.cents)),
      detail: `${formatStreak(run)} · 第 ${run.startRound}-${run.endRound} 局`,
    });
  });

  return rows.sort((a, b) => a.value - b.value);
}

/* ------------------------------------------------------------------ */
/* 12. 翻盘王：输光之后紧接着的下一局，赢回最多的一次                      */
/* ------------------------------------------------------------------ */

function collectBestComeback(rounds, groupOf) {
  // rounds 已按时间排序，push 顺序即时间顺序
  const timeline = new Map();
  rounds.forEach((round, index) => {
    groupStatsOf(round, groupOf).forEach((item, group) => {
      const list = timeline.get(group) || [];
      list.push({ round: index + 1, cents: item.cents, busted: item.busted });
      timeline.set(group, list);
    });
  });

  const best = new Map();
  timeline.forEach((list, group) => {
    list.forEach((item, i) => {
      if (!item.busted) return;
      const next = list[i + 1];
      // 必须是「赢回来」才算翻盘，下一局继续输的不算
      if (!next || next.cents <= 0) return;
      const prev = best.get(group);
      if (!prev || next.cents > prev.cents) {
        best.set(group, {
          cents: next.cents,
          bustedRound: item.round,
          backRound: next.round,
        });
      }
    });
  });

  return toRows(best, (payload) => ({
    value: fromCents(payload.cents),
    text: formatSigned(fromCents(payload.cents)),
    detail: `第 ${payload.bustedRound} 局输光 · 第 ${payload.backRound} 局赢回`,
  }));
}

/* ------------------------------------------------------------------ */
/* 13. 不死小强：输光后爬起来的次数（翻盘王看单次，这一项看次数）          */
/* ------------------------------------------------------------------ */

function collectComebackTimes(rounds, groupOf) {
  // rounds 已按时间排序，push 顺序即时间顺序
  const timeline = new Map();
  rounds.forEach((round, index) => {
    groupStatsOf(round, groupOf).forEach((item, group) => {
      const list = timeline.get(group) || [];
      list.push({ round: index + 1, cents: item.cents, busted: item.busted });
      timeline.set(group, list);
    });
  });

  const rows = [];
  timeline.forEach((list, name) => {
    let busted = 0;
    let times = 0;

    list.forEach((item, i) => {
      if (!item.busted) return;
      busted += 1;
      const next = list[i + 1];
      // 与翻盘王同口径：下一局真赢回来才算「爬起来」
      if (next && next.cents > 0) times += 1;
    });

    // 一次都没爬起来的不进韧性榜（否则 0 次会占满前排）
    if (!times) return;
    rows.push({
      name,
      value: times,
      text: `${times} 次`,
      detail: `输光 ${busted} 次 · 爬起来 ${Math.round(
        (times / busted) * 100
      )}%`,
    });
  });

  return rows.sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* 14. 连败终结者：连败之后紧接着的下一局，赢回最多的一次                  */
/* ------------------------------------------------------------------ */

function collectStreakBreaker(history, roster) {
  const rows = [];

  buildStreakSequences(history, roster).forEach(({ name, items }) => {
    let lose = 0; // 当前连败场数（平局不打断也不计数）
    let best = null;

    (items || []).forEach((item) => {
      if (item.result === "deuce") return;
      if (item.result === "lose") {
        lose += 1;
        return;
      }
      if (
        lose >= BREAK_MIN_LOSE &&
        item.cents > 0 &&
        (!best || item.cents > best.cents)
      ) {
        best = { cents: item.cents, lose, round: item.round };
      }
      lose = 0;
    });

    if (!best) return;
    rows.push({
      name,
      value: fromCents(best.cents),
      text: formatSigned(fromCents(best.cents)),
      detail: `熬过 ${best.lose} 连败 · 第 ${best.round} 局`,
    });
  });

  return rows.sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* 组装                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 记录项定义。分组（`group`）决定 UI 上的分区：
 * 高光时刻 / 至暗时刻 / 韧性时刻。
 */
const RECORD_DEFS = [
  {
    key: "bestRound",
    title: "单局最高积分",
    icon: "el-icon-top",
    hint: "一局之内赢走最多",
    tone: "up",
    group: "highlight",
    ticket: true,
  },
  {
    key: "biggestLead",
    title: "碾压王",
    icon: "el-icon-rank",
    hint: "一局领先第二名最多",
    tone: "up",
    group: "highlight",
    ticket: true,
  },
  {
    key: "bestSeason",
    title: "赛季最高积分",
    icon: "el-icon-medal",
    hint: "春夏秋冬，单季最高",
    tone: "up",
    group: "highlight",
    ticket: false,
  },
  {
    key: "longestStreak",
    title: "最高连胜",
    icon: "el-icon-caret-top",
    hint: "连续不输的最长纪录",
    tone: "up",
    group: "highlight",
    ticket: false,
  },
  {
    key: "bestRunMoney",
    title: "最猛一波",
    icon: "el-icon-money",
    hint: "连胜里赚得最多的那一段",
    tone: "up",
    group: "highlight",
    ticket: false,
  },
  {
    key: "bestRate",
    title: "最高胜率",
    icon: "el-icon-odometer",
    hint: `至少打满 ${RATE_MIN_GAMES} 局才上榜`,
    tone: "neutral",
    group: "highlight",
    ticket: false,
  },
  {
    key: "worstRound",
    title: "单局最惨",
    icon: "el-icon-bottom",
    hint: "一局之内输得最狠",
    tone: "down",
    // 数值越小（越负）越"狠"，dir 只给 buildNewRecords 判断有没有被刷新
    dir: -1,
    group: "dark",
    ticket: true,
  },
  {
    key: "worstDay",
    title: "当日最惨",
    icon: "el-icon-cloudy",
    hint: "自然日累计，单日最惨",
    tone: "down",
    dir: -1,
    group: "dark",
    ticket: false,
  },
  {
    key: "longestLose",
    title: "最长连败",
    icon: "el-icon-caret-bottom",
    hint: "连续不胜的最长纪录",
    tone: "down",
    group: "dark",
    ticket: false,
  },
  {
    key: "worstStreak",
    title: "最惨连败",
    icon: "el-icon-arrow-down",
    hint: "亏得最多的那一段连败",
    tone: "down",
    dir: -1,
    group: "dark",
    ticket: false,
  },
  {
    key: "mostBusted",
    title: "最多输光次数",
    icon: "el-icon-warning-outline",
    hint: "筹码清零且当局亏损",
    tone: "down",
    group: "dark",
    ticket: false,
  },
  {
    key: "bestComeback",
    title: "翻盘王",
    icon: "el-icon-refresh",
    hint: "输光后下一局赢回最多",
    tone: "up",
    group: "grit",
    ticket: true,
  },
  {
    key: "comebackTimes",
    title: "不死小强",
    icon: "el-icon-first-aid-kit",
    hint: "输光后爬起来的次数",
    tone: "up",
    group: "grit",
    ticket: false,
  },
  {
    key: "streakBreaker",
    title: "连败终结者",
    icon: "el-icon-lightning",
    hint: `连败 ${BREAK_MIN_LOSE} 场后赢回最多`,
    tone: "up",
    group: "grit",
    ticket: true,
  },
];

/** UI 分区顺序与标题 */
export const RECORD_GROUPS = [
  { key: "highlight", title: "高光时刻", hint: "赢下来的那些纪录" },
  { key: "dark", title: "至暗时刻", hint: "输的每一面都留个名" },
  { key: "grit", title: "韧性时刻", hint: "扛得住才算本事" },
];

/**
 * 全部记录一次算全（顺序同 RECORD_DEFS）。
 *
 * @returns {Array<{key,title,icon,hint,tone,group,leader:object|null,board:Array}>}
 *   leader —— 当前保持者 `{name, value, text, detail}`；无人达门槛时为 null
 *   board  —— 前 BOARD_SIZE 名挑战者（含冠军）
 */
export function buildRecords(history, players) {
  const roster = Array.isArray(players) ? players : [];
  const rounds = sortByTime(history);
  const groupOf = (name) => mainOf(roster, name);

  const rowsOf = {
    bestRound: () => collectBestRound(rounds, groupOf),
    biggestLead: () => collectBiggestLead(rounds, groupOf),
    bestSeason: () => collectBestSeason(history, roster),
    longestStreak: () => collectLongestStreak(history, roster),
    bestRunMoney: () => collectBestRunMoney(history, roster),
    bestRate: () => collectBestRate(rounds, groupOf),
    mostBusted: () => collectMostBusted(rounds, groupOf),
    worstRound: () => collectWorstRound(rounds, groupOf),
    worstDay: () => collectWorstDay(rounds, groupOf),
    longestLose: () => collectLongestLose(history, roster),
    worstStreak: () => collectWorstStreak(history, roster),
    bestComeback: () => collectBestComeback(rounds, groupOf),
    comebackTimes: () => collectComebackTimes(rounds, groupOf),
    streakBreaker: () => collectStreakBreaker(history, roster),
  };

  return RECORD_DEFS.map((def) => {
    const collect = rowsOf[def.key];
    const rows = collect ? collect() : [];
    return {
      ...def,
      leader: rows.length ? rows[0] : null,
      board: rows.slice(0, BOARD_SIZE),
    };
  });
}

/** 按 UI 分区打包：每个分区带标题与它下面的记录卡 */
export function groupRecords(records) {
  const list = Array.isArray(records) ? records : [];
  return RECORD_GROUPS.map((group) => ({
    ...group,
    items: list.filter((record) => record.group === group.key),
  })).filter((group) => group.items.length);
}

/**
 * 「荣誉墙」：把所有记录按人聚合，看谁霸榜最多。
 * @returns {Array<{name, count, titles:string[]}>}
 */
export function buildRecordWall(records) {
  const tally = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record.leader) return;
    const entry = tally.get(record.leader.name) || {
      name: record.leader.name,
      count: 0,
      titles: [],
    };
    entry.count += 1;
    entry.titles.push(record.title);
    tally.set(entry.name, entry);
  });

  return Array.from(tally.values()).sort(
    (a, b) => b.count - a.count || compareName(a.name, b.name)
  );
}

/**
 * 本局刷新了记录榜上哪几项纪录：主账号名 → { count, items }。
 *
 * `items` 带上每一项的标题，结算面板要写清楚"创造了什么新纪录"，
 * 只给一个数字玩家根本不知道自己干了什么。
 *
 * ⚠️ 判定不能只看"数值变了没有"：当日 / 当季这类记录是**在途累计**，
 * 同一个人今天再输一局，他的「当日最高」会从 +30 缩回 +20 —— 数值确实变了，
 * 但那是纪录被稀释，不是被刷新。所以必须按该项自己的排序方向 `dir` 比：
 *  - `dir = 1`（默认）：数值变大才算刷新（单局最高、连胜、输光次数 …）
 *  - `dir = -1`：数值变小（更惨）才算刷新（单局最惨 / 当日最惨 / 最惨连败）
 * 其余两种：原来没人达标（首次登榜）算；并列后排序易主（值没动）不算。
 *
 * ⚠️ 只有 `ticket: true` 的项才进这张表（= 才发奖券）：**单局发生的事**才配叫
 * 「创造新纪录」。赛季 / 当日 / 连胜 / 连败 / 输光次数 / 胜率这类**累计型**记录，
 * 只要又打一局数值就会自然变大（累计、+1 场），于是每局都判"刷新"→ 每局白送
 * 一二十张券，奖券严重通胀（实测第二局打得跟第一局一模一样也发 40 券）。
 * 它们照常记在记录榜上，只是不再计券。
 *
 * 至暗时刻里 `worstRound`（单局最惨）仍计券，与「输光发安慰券」一个思路：
 * 输也要输得有排面。
 *
 * @param {Array} prevHistory 本局入账前的流水（调用方在 unshift 之前存好的那份）
 * @param {Array} nextHistory 本局入账后的流水
 * @param {Array} players 全量玩家（mainOf 归集用）
 * @returns {object} 主账号名 → { count: 项数, items: [{key,title,value}] }
 */
export function buildNewRecords(prevHistory, nextHistory, players) {
  const roster = Array.isArray(players) ? players : [];
  const before = buildRecords(prevHistory, roster);
  const after = buildRecords(nextHistory, roster);
  const map = {};

  after.forEach((item, index) => {
    if (item.ticket === false) return; // 累计型记录不计券（见上面注释）
    const leader = item.leader;
    if (!leader) return;
    const name = String(leader.name || "").trim();
    if (!name) return;

    const was = (before[index] || {}).leader || null;
    if (was) {
      // 大者为王（dir 1）还是小者为王（dir -1），按记录项自己的排序方向来
      const biggerWins = item.dir !== -1;
      const improved = biggerWins
        ? leader.value > was.value
        : leader.value < was.value;
      if (!improved) return;
    }

    map[name] = map[name] || { count: 0, items: [] };
    map[name].count += 1;
    map[name].items.push({ key: item.key, title: item.title, value: leader.value });
  });

  return map;
}

/** 记录卡上的「保持者 + 数值」，无记录时的占位文案 */
export function formatRecordLeader(record) {
  if (!record || !record.leader) return { name: "虚位以待", text: "—" };
  return record.leader;
}

/** 名次样式：前三名金银铜 */
export function rankClass(index) {
  if (index === 0) return "rank rank--gold";
  if (index === 1) return "rank rank--silver";
  if (index === 2) return "rank rank--bronze";
  return "rank";
}

