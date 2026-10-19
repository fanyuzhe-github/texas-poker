/**
 * 数据看板的统计层：与结算、排名一样保持纯函数，方便单测。
 *
 * 两个数据源的分工：
 * - history（对局流水）：用于还原「随对局变化的」时间序列，例如资金曲线、每局流水额
 * - players（总榜）：用于「当下状态」，例如累计积分、胜负场次
 * 两者互相对照：曲线终点 ≈ 总榜积分，若不一致说明中途删过号 / 合并过数据。
 */
import { toCents, fromCents } from "./money";
import { mainOf, buildMainRanking } from "./ranking";

/** 曲线最多画几条：人多的时候全画会糊成一团 */
export const MAX_SERIES = 8;

function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

/** 时间戳 -> MM-DD HH:mm */
export function formatClock(timestamp) {
  const ts = Number(timestamp);
  // 注意别写成 `Number(x) || Date.now()`：NaN / 0 都是 falsy，会悄悄变成"当前时间"
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "--";
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 按时间正序排列的合法对局 */
export function sortByTime(history) {
  const list = Array.isArray(history) ? history : [];
  return list
    .filter((item) => item && Array.isArray(item.records))
    .slice()
    .sort((a, b) => toInt(a.time) - toInt(b.time));
}

/**
 * 资金曲线：逐局重放流水，算出每个「主账号」的累计盈亏。
 * 上桌的是子账号，积分要归到它的主账号头上（与总榜口径一致）。
 *
 * @returns {{labels:string[], times:string[], series:Array<{name:string,data:number[]}>}}
 */
export function buildTimeline(history, players) {
  const rounds = sortByTime(history);
  const roster = Array.isArray(players) ? players : [];
  const groupOf = (name) => mainOf(roster, name);

  const names = [];
  rounds.forEach((round) => {
    round.records.forEach((record) => {
      const group = groupOf(record.name);
      if (group && !names.includes(group)) names.push(group);
    });
  });

  const running = new Map(names.map((name) => [name, 0]));
  const series = names.map((name) => ({ name, data: [] }));

  rounds.forEach((round) => {
    // 同一主账号在一局里理论上只出一个号，保险起见还是按组求和
    const deltaOfRound = new Map();
    round.records.forEach((record) => {
      const group = groupOf(record.name);
      deltaOfRound.set(
        group,
        (deltaOfRound.get(group) || 0) + toCents(record.delta)
      );
    });

    names.forEach((name, index) => {
      const current = (running.get(name) || 0) + (deltaOfRound.get(name) || 0);
      running.set(name, current);
      series[index].data.push(fromCents(current));
    });
  });

  // 只留下「波动最大」的若干条曲线，其余的画上去只会互相遮挡
  const ranked = series
    .map((item) => ({
      ...item,
      swing: item.data.reduce(
        (acc, value) => Math.max(acc, Math.abs(value)),
        0
      ),
    }))
    .sort((a, b) => b.swing - a.swing)
    .slice(0, MAX_SERIES)
    .map(({ name, data }) => ({ name, data }));

  return {
    labels: rounds.map((round, index) => `#${index + 1}`),
    times: rounds.map((round) => formatClock(round.time)),
    series: ranked,
  };
}

/**
 * 总榜盈亏：直接取总榜的汇总积分（含胜负场次），按积分降序。
 * @returns {Array<{name, score, win, lose, deuce, games}>}
 */
export function buildScoreBars(players) {
  return buildMainRanking(players).map((row) => {
    const result = row.raceResult || {};
    const win = toInt(result.win);
    const lose = toInt(result.lose);
    const deuce = toInt(result.deuce);
    return {
      name: row.name,
      score: fromCents(toCents(row.score)),
      win,
      lose,
      deuce,
      games: win + lose + deuce,
    };
  });
}

/**
 * 每局的流水规模：桌上的总投入（= 各家剩余筹码之和）与在场人数。
 * @returns {{labels:string[], amount:number[], seats:number[]}}
 */
export function buildRoundFlow(history) {
  const rounds = sortByTime(history);
  return {
    labels: rounds.map((round, index) => `#${index + 1}`),
    amount: rounds.map((round) =>
      fromCents(
        round.records.reduce((acc, record) => acc + toCents(record.chips), 0)
      )
    ),
    seats: rounds.map((round) => round.records.length),
  };
}

/** 出勤榜：按参与过的局数降序 */
export function buildAttendance(history, players) {
  const rounds = sortByTime(history);
  const roster = Array.isArray(players) ? players : [];
  const counter = new Map();

  rounds.forEach((round) => {
    const seen = new Set();
    round.records.forEach((record) => {
      const group = mainOf(roster, record.name);
      if (seen.has(group)) return;
      seen.add(group);
      counter.set(group, (counter.get(group) || 0) + 1);
    });
  });

  return Array.from(counter.entries())
    .map(([name, games]) => ({ name, games }))
    .sort((a, b) => b.games - a.games);
}

/** 胜负构成：全局的胜 / 负 / 平场次 */
export function buildResultPie(players) {
  const rows = buildScoreBars(players);
  const pie = { win: 0, lose: 0, deuce: 0 };
  rows.forEach((row) => {
    pie.win += row.win;
    pie.lose += row.lose;
    pie.deuce += row.deuce;
  });
  return [
    { name: "胜", value: pie.win },
    { name: "负", value: pie.lose },
    { name: "平", value: pie.deuce },
  ];
}

/**
 * 关键指标：看板顶部那排数字。
 * 单局最猛 / 最惨都取「单条流水记录」的极值，而不是累计值。
 */
export function buildSummary(history, players) {
  const rounds = sortByTime(history);
  const bars = buildScoreBars(players);
  const roster = Array.isArray(players) ? players : [];

  let turnover = 0;
  let swingTotal = 0;
  let swingCount = 0;
  let bestRound = null;
  let worstRound = null;

  rounds.forEach((round) => {
    round.records.forEach((record) => {
      const chips = toCents(record.chips);
      const delta = toCents(record.delta);
      turnover += chips;
      swingTotal += Math.abs(delta);
      swingCount += 1;

      const candidate = {
        name: record.name,
        group: mainOf(roster, record.name),
        delta: fromCents(delta),
        round,
      };
      if (!bestRound || delta > toCents(bestRound.delta)) bestRound = candidate;
      if (!worstRound || delta < toCents(worstRound.delta))
        worstRound = candidate;
    });
  });

  const ranked = bars.slice().sort((a, b) => b.score - a.score);
  const groups = new Set();
  rounds.forEach((round) =>
    round.records.forEach((record) => groups.add(mainOf(roster, record.name)))
  );

  return {
    games: rounds.length,
    playerCount: Math.max(groups.size, 0),
    turnover: fromCents(turnover),
    avgSwing: swingCount ? fromCents(Math.round(swingTotal / swingCount)) : 0,
    bestPlayer: ranked[0] || null,
    worstPlayer: ranked.length ? ranked[ranked.length - 1] : null,
    bestRound: bestRound
      ? { ...bestRound, time: formatClock(bestRound.round.time) }
      : null,
    worstRound: worstRound
      ? { ...worstRound, time: formatClock(worstRound.round.time) }
      : null,
  };
}

/** 一次性算好看板需要的全部数据 */
export function buildDashboard(history, players) {
  const rounds = sortByTime(history);
  return {
    hasData: rounds.length > 0,
    summary: buildSummary(history, players),
    timeline: buildTimeline(history, players),
    scores: buildScoreBars(players),
    flow: buildRoundFlow(history),
    attendance: buildAttendance(history, players),
    pie: buildResultPie(players),
  };
}
