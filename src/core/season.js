/**
 * 赛季划分与赛季榜统计（纯函数）。
 *
 * 一年四个赛季，按北半球习惯划分：
 *   春 = 3/4/5 月，夏 = 6/7/8 月，秋 = 9/10/11 月，冬 = 12 + 次年 1/2 月
 * 冬季跨年，所以它的「归属年份」取 12 月那一年 —— 2026 冬 = 2026-12 ~ 2027-02。
 * 这样 2026 冬 排在 2026 秋 之后、2027 春 之前，时间轴不会乱。
 *
 * 赛季积分一律从「对局流水」重算，不用玩家身上那份全局累计积分 ——
 * 后者是所有赛季混在一起的，拆不出赛季来。
 */
import { toCents, fromCents } from "./money";
import { mainOf } from "./ranking";
import { sortByTime, formatClock } from "./stats";
import { buildStreakBoard } from "./streak";

export const SEASONS = [
  { key: "spring", label: "春", months: [3, 4, 5] },
  { key: "summer", label: "夏", months: [6, 7, 8] },
  { key: "autumn", label: "秋", months: [9, 10, 11] },
  { key: "winter", label: "冬", months: [12, 1, 2] },
];

const KEY_INDEX = SEASONS.reduce(
  (acc, item, index) => ({ ...acc, [item.key]: index }),
  {}
);

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * 某个时间点属于哪个赛季。
 * @returns {{year:number, key:string, label:string, code:string, index:number}}
 */
export function seasonOf(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;

  const month = date.getMonth() + 1;
  const calendarYear = date.getFullYear();

  let key = "spring";
  if (month >= 3 && month <= 5) key = "spring";
  else if (month >= 6 && month <= 8) key = "summer";
  else if (month >= 9 && month <= 11) key = "autumn";
  else key = "winter";

  // 1、2 月归到上一年开的那个冬季
  const year = key === "winter" && month <= 2 ? calendarYear - 1 : calendarYear;
  const index = KEY_INDEX[key];

  return {
    year,
    key,
    index,
    label: `${year} ${SEASONS[index].label}`,
    code: `${year}-${key}`,
  };
}

/** 赛季之间的先后编号：年份 × 10 + 季节序号，冬(3) 天然排在秋(2) 之后 */
export function seasonSortValue(season) {
  if (!season) return 0;
  return season.year * 10 + season.index;
}

/** 当前所处赛季 */
export function currentSeason(now = Date.now()) {
  return seasonOf(now);
}

/** 相邻赛季（offset 为 -1 上一个、+1 下一个），用于左右翻页 */
export function shiftSeason(season, offset) {
  if (!season) return null;
  // 一年只有 4 个赛季，进位 / 借位都得按 4 进制算，不能拿 `year * 10 + index` 直接加减。
  // Math.floor 保证 offset 为负时年份会正确向下借一位，index 恒落在 0..3
  const total = season.year * SEASONS.length + season.index + toInt(offset);
  const year = Math.floor(total / SEASONS.length);
  const index = total - year * SEASONS.length;
  const item = SEASONS[index];
  if (!item) return null;
  return {
    year,
    key: item.key,
    index,
    label: `${year} ${item.label}`,
    code: `${year}-${item.key}`,
  };
}

/** 赛季的起止时间（含头不含尾），冬季会自动跨到次年 2 月底 */
export function seasonRange(season) {
  if (!season) return null;
  const { year, key } = season;
  if (key === "winter") {
    return {
      start: new Date(year, 11, 1).getTime(),
      end: new Date(year + 1, 2, 1).getTime(),
    };
  }
  const months = SEASONS[KEY_INDEX[key]].months;
  return {
    start: new Date(year, months[0] - 1, 1).getTime(),
    end: new Date(year, months[months.length - 1], 1).getTime(),
  };
}

/**
 * 赛季是否已收官。
 *
 * 「赛季冠军」这类长周期勋章要靠它卡时间：赛季还在打的时候谁领先都不算数，
 * 只有过了收官点（赛季区间右端 = 下一赛季起点）才把奖颁出去。
 * 冬季跨年，收官点自然是次年 3 月 1 日 —— 由 seasonRange 处理，这里不重复算。
 */
export function isSeasonClosed(season, now = Date.now()) {
  const range = seasonRange(season);
  if (!range) return false;
  return Number(now) >= range.end;
}

/**
 * 赛季的收官时刻（赛季最后一毫秒）。
 * 冠军章的解锁时间用它：既不是某一局，也不是"现在"，而是奖真正到手的那一刻。
 */
export function seasonEndAt(season) {
  const range = seasonRange(season);
  return range ? range.end - 1 : 0;
}

function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

/** 时间戳 -> YYYY-MM-DD */
export function formatDate(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

/** 赛季可读的时间区间，例如「2026-09-01 ~ 2026-11-30」 */
export function seasonPeriod(season) {
  const range = seasonRange(season);
  if (!range) return "";
  return `${formatDate(range.start)} ~ ${formatDate(range.end - 86400000)}`;
}

function emptyStat(name) {
  return {
    name,
    cents: 0,
    win: 0,
    lose: 0,
    deuce: 0,
    games: 0,
    best: 0,
    worst: 0,
    hasResult: false,
    lastState: "deuce",
    stateTimes: 0,
    members: new Map(),
  };
}

function emptyMember(name) {
  return { ...emptyStat(name), members: null };
}

/**
 * 第二参数支持三种写法：season 对象（组件就用这个）、时间戳、
 * 以及 "{年份}-{季节}" 的 code（例如 "2025-winter"）。
 * 只认时间戳的话传 code 会静默查出一个空赛季，很难排查。
 */
function resolveSeason(season) {
  // 数字一律按时间戳解释
  if (typeof season === "number") return seasonOf(season);
  if (typeof season === "string") {
    const asTime = seasonOf(season);
    if (asTime) return asTime;

    const matched = /^(-?\d+)-([a-z]+)$/.exec(season);
    if (!matched || !Object.prototype.hasOwnProperty.call(KEY_INDEX, matched[2]))
      return null;
    return shiftSeason(
      { year: Number(matched[1]), index: KEY_INDEX[matched[2]] },
      0
    );
  }
  return season;
}

/**
 * 单个赛季的完整统计（含主账号归集）。
 *
 * @returns {{season, games, turnover, champion, bestRound, streakLeader, ranking:Array}}
 */
export function buildSeasonReport(history, players, season) {
  const roster = Array.isArray(players) ? players : [];
  const target = resolveSeason(season);
  if (!target) {
    return {
      season: null,
      games: 0,
      turnover: 0,
      champion: null,
      bestRound: null,
      streakLeader: null,
      ranking: [],
    };
  }

  const rounds = sortByTime(history).filter((round) => {
    const item = seasonOf(round.time);
    return item && item.code === target.code;
  });

  // 连胜/连败在本赛季范围内单独重放，跨赛季不会串在一起
  const streakMap = new Map(
    buildStreakBoard(rounds, roster).map((row) => [row.name, row])
  );

  const groups = new Map();
  let turnover = 0;
  let bestRound = null;

  rounds.forEach((round) => {
    const seenGroup = new Set();

    round.records.forEach((record) => {
      const group = mainOf(roster, record.name);
      if (!groups.has(group)) groups.set(group, emptyStat(group));
      const groupStat = groups.get(group);

      if (!groupStat.members.has(record.name))
        groupStat.members.set(record.name, emptyMember(record.name));
      const memberStat = groupStat.members.get(record.name);

      const delta = toCents(record.delta);
      turnover += toCents(record.chips);

      [groupStat, memberStat].forEach((stat) => {
        stat.cents += delta;
        stat[record.result] = (stat[record.result] || 0) + 1;
        if (!stat.hasResult || delta > stat.best) stat.best = delta;
        if (!stat.hasResult || delta < stat.worst) stat.worst = delta;
        stat.hasResult = true;

        // 平局不改变连胜 / 连败状态
        if (record.result !== "deuce") {
          stat.stateTimes =
            record.result === stat.lastState ? stat.stateTimes + 1 : 1;
          stat.lastState = record.result;
        }
      });

      if (!seenGroup.has(group)) {
        seenGroup.add(group);
        groupStat.games += 1;
      }
      memberStat.games += 1;

      if (!bestRound || delta > bestRound.cents) {
        bestRound = {
          cents: delta,
          name: record.name,
          group,
          time: formatClock(round.time),
        };
      }
    });
  });

  const ranking = Array.from(groups.values())
    .map((stat) => {
      const streak = streakMap.get(stat.name) || null;
      return {
        name: stat.name,
        score: fromCents(stat.cents),
        raceResult: { win: stat.win, lose: stat.lose, deuce: stat.deuce },
        games: stat.games,
        bestDelta: stat.hasResult ? fromCents(stat.best) : 0,
        worstDelta: stat.hasResult ? fromCents(stat.worst) : 0,
        lastState: stat.lastState,
        stateTimes: stat.stateTimes,
        current: streak ? streak.current : null,
        longestWin: streak ? streak.longestWin : null,
        longestLose: streak ? streak.longestLose : null,
        children: Array.from(stat.members.values())
          .filter((member) => member.name !== stat.name)
          .map((member) => ({
            name: member.name,
            score: fromCents(member.cents),
            raceResult: {
              win: member.win,
              lose: member.lose,
              deuce: member.deuce,
            },
            games: member.games,
          })),
      };
    })
    .sort((a, b) => b.score - a.score || b.raceResult.win - a.raceResult.win);

  // 本季最长的那段连胜（先比场次，场次相同比赚的钱）
  const streakLeader = ranking.reduce((acc, row) => {
    const run = row.longestWin;
    if (!run) return acc;
    if (!acc) return { name: row.name, run };
    if (run.times > acc.run.times) return { name: row.name, run };
    if (run.times === acc.run.times && run.cents > acc.run.cents)
      return { name: row.name, run };
    return acc;
  }, null);

  return {
    season: target,
    games: rounds.length,
    turnover: fromCents(turnover),
    champion: ranking[0] || null,
    bestRound: bestRound
      ? { ...bestRound, delta: fromCents(bestRound.cents) }
      : null,
    streakLeader,
    ranking,
  };
}

/**
 * 当前赛季各主账号的积分 —— 段位专用。
 *
 * 只做「筛本赛季流水 + 按主账号归集求和」，不重放连胜、不排榜，
 * 比 buildSeasonReport 轻得多，适合每次渲染都跟着变。
 *
 * 归集口径与总榜 / 赛季榜一致：子账号的战绩算到主账号头上；
 * 主账号自己上桌也算在这一组里（mainOf(自己) === 自己）。
 *
 * @param {Array} history 对局流水
 * @param {Array} players 全量玩家（mainOf 归集用）
 * @param {number} [now] 当前时间，用于判定「当前赛季」
 * @returns {Map<string, number>} 主账号名 → 本赛季积分（元）
 *          ⚠️ 本赛季没上过桌的账号**不在表里**，取不到就当作 0 分
 */
export function buildSeasonScores(history, players, now = Date.now()) {
  const target = currentSeason(now);
  if (!target) return new Map();

  const roster = Array.isArray(players) ? players : [];
  const rounds = Array.isArray(history) ? history : [];
  const centsMap = new Map();

  rounds.forEach((round) => {
    const item = seasonOf(round.time);
    if (!item || item.code !== target.code) return;

    (round.records || []).forEach((record) => {
      const group = mainOf(roster, record.name);
      centsMap.set(group, (centsMap.get(group) || 0) + toCents(record.delta));
    });
  });

  const out = new Map();
  centsMap.forEach((cents, name) => out.set(name, fromCents(cents)));
  return out;
}

/**
 * 流水里出现过的所有赛季，按时间倒序。
 * 当前赛季永远在列，哪怕还没有打过牌（刚开局时下拉不至于空白）。
 */
export function listSeasons(history, now = Date.now()) {
  const seen = new Map();
  sortByTime(history).forEach((round) => {
    const item = seasonOf(round.time);
    if (item && !seen.has(item.code)) seen.set(item.code, item);
  });

  const now_ = currentSeason(now);
  if (now_ && !seen.has(now_.code)) seen.set(now_.code, now_);

  return Array.from(seen.values()).sort(
    (a, b) => seasonSortValue(b) - seasonSortValue(a)
  );
}

/** 跨赛季走势：每个主账号在每个赛季的积分（只在出现过的赛季记点，未参赛算 0） */
export function buildSeasonTimeline(history, players, maxSeries = 8) {
  const seasons = buildSeasonChampions(history, players)
    .map((item) => item.season)
    .reverse(); // 时间正序

  const names = [];
  const points = new Map();

  seasons.forEach((season, index) => {
    const { ranking } = buildSeasonReport(history, players, season);
    ranking.forEach((row) => {
      if (!points.has(row.name)) {
        points.set(
          row.name,
          seasons.map(() => 0)
        );
        names.push(row.name);
      }
      points.get(row.name)[index] = row.score;
    });
  });

  const series = names
    .map((name) => ({ name, data: points.get(name) }))
    .sort(
      (a, b) =>
        b.data.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0) -
        a.data.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0)
    )
    .slice(0, maxSeries);

  return {
    labels: seasons.map((season) => season.label),
    codes: seasons.map((season) => season.code),
    series,
  };
}

/** 历届回顾：每个赛季的冠军，倒序 */
export function buildSeasonChampions(history, players) {
  return listSeasons(history)
    .map((season) => {
      const report = buildSeasonReport(history, players, season);
      return {
        season,
        code: season.code,
        label: season.label,
        period: seasonPeriod(season),
        games: report.games,
        turnover: report.turnover,
        champion: report.champion,
        bestRound: report.bestRound,
      };
    })
    .filter((item) => item.games > 0);
}
