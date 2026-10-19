/**
 * 成就勋章 —— 28 枚「荣誉 15 + 连胜 8 + 黑章 5」，纯重放 history 得出。
 *
 * 设计约定（改动前必读）：
 *
 * 1. **不新增任何持久化字段**：全部从对局流水重算，玩家库 schema 不用动。
 *    好处是删流水、改归属之后勋章自动跟着变，不存在"勋章和历史打架"的情况。
 * 2. **归集口径与总榜 / 记录榜完全一致**：战绩用 `mainOf()` 归到主账号，
 *    金额全程走 `money.js` 的整数「分」，只在对外文案里 `fromCents()`。
 * 3. **每人对同一枚勋章只解锁一次**，记的是他**第一次达成**的那一局（局号 + 时间）；
 *    全局再按这一局取「首杀」——荣誉感来自首杀，不来自"现在谁有"。
 * 4. **阈值一律按底注（`round.baseChips`）的倍数算**，别写死 10 / 20 / 30：
 *    设置里底注可以改，写死会让整套勋章换个底注就全部失效或全部白送。
 * 5. **单局胜负沿用 `streak.js` 的规则**（优先信任 `record.result`，脏数据才回落到金额符号），
 *    连胜段也是「平局不打断、不计次」那份口径 —— 本文件直接消费 `buildStreakSequences`，
 *    只在它之上补三项它不带的信息：`busted`（是否输光）、`chips`（该局剩余筹码）、
 *    `pot`（本桌规模 = 人数 × 底注）。
 * 6. **黑勋章只发给真的打输过的人**：没有输光记录的人不该拿到「输光次数」这类勋章，
 *    判定同 `records.js`（`chips <= 0 && delta < 0`），底注为 0 的脏数据不会全员误判。
 * 7. ⚠️ **写门槛前先算一下它能不能达成**，这是本文件最贵的两次返工：
 *    - 结算后剩余筹码最低就是 0，所以**单局最大亏损恒等于一个底注**，
 *      「单局亏 ≥ N 倍底注（N>1）」永远不可能达成 —— 想要这条就改成按自然日累计。
 *    - 每局筹码是重新按底注发的，剩余筹码低于底注就等于这局是亏的，
 *      所以「筹码只剩很少还赢一局」同样是死条件。
 *    现在的「一日散财」「一日暴富」这类才跨得过去；`round3x` 需要同桌 ≥ 4 人才可能。
 * 8. 依赖方向：achievements → season / streak / stats / ranking，单向无环。
 *    记录榜里已经下线的「铁人出勤」那套（出勤王 / 连续出勤 / 元老）**不要在本文件复活**。
 */
import { toCents, fromCents, format, formatSigned } from "./money";
import { mainOf } from "./ranking";
import { sortByTime, formatClock } from "./stats";
import { buildStreakSequences, STREAK_LABEL } from "./streak";
import {
  listSeasons,
  buildSeasonReport,
  seasonOf,
  isSeasonClosed,
  seasonEndAt,
  formatDate,
} from "./season";

/** 底注脏数据时的兜底：10 元 */
const DEFAULT_STAKE = 1000;

/** 单局赢的底注倍数阶梯 */
const ROUND_MULT = [1, 2, 3];

/**
 * 连胜阶梯：3 ~ 10 连胜一人一枚，共 8 枚。
 * ⚠️ 连胜章独立成一组（`kind: "streak"`），不并入荣誉勋章。
 */
const STREAK_STEPS = [3, 4, 5, 6, 7, 8, 9, 10];

/** 连胜章称号：从三到十，取成语 / 吉利话（顺序与 STREAK_STEPS 一一对应） */
const STREAK_TITLES = [
  "三阳开泰",
  "四通八达",
  "五路财神",
  "六六大顺",
  "七星高照",
  "八仙过海",
  "九九归一",
  "十全十美",
];

/**
 * 连胜章图标：座位表里勋章只露小圆牌，八枚同为旗子会完全分不清，
 * 所以逐枚给不同图标（顺序与 STREAK_STEPS 一一对应）。
 */
const STREAK_ICONS = [
  "el-icon-sunrise",
  "el-icon-position",
  "el-icon-money",
  "el-icon-present",
  "el-icon-star-on",
  "el-icon-s-promotion",
  "el-icon-s-grid",
  "el-icon-trophy",
];

/** 输光次数阶梯 */
const BUSTED_STEPS = [5, 10];

/** 当日累计赢的底注倍数 */
const DAY_MULT = 5;

/** 赛季累计赢的底注倍数 */
const SEASON_MULT = 10;

/** 当日累计亏的底注倍数（黑勋章） */
const NEG_DAY_MULT = 5;

/** 生涯累计亏损的底注倍数（黑勋章） */
const LOSS_MULT = 10;

/**
 * 「半壁江山」：单局结束时手里握着桌上过半的筹码。
 * 别写成"筹码很少还赢一局"—— 每一局的筹码是重新按底注发的，
 * 结算后剩余筹码低于底注就等于这局是亏的，那个条件永远不可能达成。
 */
const HALF_TABLE_RATIO = 0.5;

/** 「零封之夜」：同一天至少打满这么多局，且局局都赢 */
const PERFECT_DAY_MIN_GAMES = 3;

/** 「常胜将军」：连续多少个自然日每天都在净赚 */
const PROFIT_DAYS = 3;

/** 「盆满钵满」：生涯累计净赚的底注倍数 */
const GAIN_MULT = 20;

/** 「牌桌老炮」：累计出场局数 */
const VETERAN_GAMES = 50;

/** 连续多少局不输光 */
const SURVIVE_TIMES = 10;

/** 最长连败（黑勋章） */
const LOSE_STREAK_TIMES = 5;

/** 神射手的准入：至少这么多局，胜率不低于此 */
const RATE_MIN_GAMES = 20;
const RATE_MIN = 0.6;

/** 赛季冠军至少要打够的局数，避免"只来一局侥幸登顶" */
const CHAMPION_MIN_GAMES = 3;

/** 名次 / 段位：金 > 银 > 铜 */
export const TIER_LABEL = {
  gold: "金",
  silver: "银",
  bronze: "铜",
};

function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

/** 本地自然日 key：YYYY-MM-DD（口径同 records.js 的当日统计） */
function dayKey(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

/** 自然日的可读文本：03-01 */
function dayLabel(key) {
  const parts = String(key || "").split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : "—";
}

/** 输光判定（同 records.js：筹码清零且这一局是亏的） */
function isBustedRecord(record) {
  return toCents(record.chips) <= 0 && toCents(record.delta) < 0;
}

/** 单局底注（分）。脏数据 / 没填时回落到默认 10 元 */
function stakeOf(round) {
  const cents = toCents(round && round.baseChips);
  return cents > 0 ? cents : DEFAULT_STAKE;
}

/* ------------------------------------------------------------------ */
/* 账本：把流水重建成「每个主账号一整条时间线」                          */
/* ------------------------------------------------------------------ */

/**
 * @returns {{rounds:Array, stake:number, sequences:Array}}
 *   stake     —— 最近一局的底注（分），用于生成勋章条件的金额文案
 *   sequences —— [{name, items:[{round,time,result,cents,chips,busted,stake}]}]
 */
function buildLedger(history, players) {
  const rounds = sortByTime(history);
  const roster = Array.isArray(players) ? players : [];
  const stakeByRound = rounds.map(stakeOf);

  // buildStreakSequences 不带「输光」，这里按 `主账号@局号` 补一张表，
  // 顺带算出本桌的彩池规模（人数 × 底注），供「半壁江山」判断时用
  const extras = new Map();
  rounds.forEach((round, index) => {
    const records = (round.records || []).filter(
      (record) => record && record.name
    );
    const pot = stakeByRound[index] * records.length;

    // 「一网打尽」：同桌**其他**主账号这一局都是亏的（delta < 0），不要求被打光。
    // 按主账号汇总 delta：同一主账号两个号一赢一亏时，他整体没亏，不该算在"输家"里。
    // 至少要有两个主账号同桌才算，否则一个人自己摆一桌就白送了。
    const groups = [];
    const deltaByGroup = new Map();
    records.forEach((record) => {
      const group = mainOf(roster, record.name);
      if (!group) return;
      if (groups.indexOf(group) < 0) groups.push(group);
      deltaByGroup.set(group, (deltaByGroup.get(group) || 0) + toCents(record.delta));
    });

    const allLose = new Map();
    groups.forEach((group) => {
      let hit = groups.length > 1;
      if (hit) {
        deltaByGroup.forEach((delta, other) => {
          if (other === group) return;
          if (delta >= 0) hit = false;
        });
      }
      allLose.set(group, hit);
    });

    const agg = new Map();
    records.forEach((record) => {
      const group = mainOf(roster, record.name);
      if (!group) return;
      const item = agg.get(group) || { busted: false, chips: null };
      if (isBustedRecord(record)) item.busted = true;
      item.chips = Math.min(
        item.chips === null ? toCents(record.chips) : item.chips,
        toCents(record.chips)
      );
      agg.set(group, item);
    });

    agg.forEach((item, group) => {
      extras.set(`${group}@${index + 1}`, {
        busted: item.busted,
        chips: item.chips === null ? 0 : item.chips,
        pot,
        stake: stakeByRound[index],
        allLose: !!allLose.get(group),
      });
    });
  });

  const sequences = buildStreakSequences(history, players).map((seq) => ({
    name: seq.name,
    items: seq.items.map((item) => {
      const extra = extras.get(`${seq.name}@${item.round}`) || {
        busted: false,
        chips: 0,
        pot: 0,
        stake: DEFAULT_STAKE,
        allLose: false,
      };
      return {
        ...item,
        busted: extra.busted,
        chips: extra.chips,
        pot: extra.pot,
        stake: extra.stake,
        allLose: extra.allLose,
      };
    }),
  }));

  return {
    rounds,
    stake: stakeByRound.length
      ? stakeByRound[stakeByRound.length - 1]
      : DEFAULT_STAKE,
    sequences,
  };
}

/** 一条解锁记录。detail 统一带上「第 N 局 · MM-DD HH:mm」 */
function unlock(seq, item, value, text, tail) {
  return {
    name: seq.name,
    round: item.round,
    time: item.time,
    value,
    text,
    detail: `第 ${item.round} 局 · ${formatClock(item.time)}${
      tail ? ` · ${tail}` : ""
    }`,
  };
}

/** 同一人有多次达成时只留最早的一次，再按全局达成先后排序 */
function firstTimeEach(rows) {
  const picked = new Map();
  rows.forEach((row) => {
    const prev = picked.get(row.name);
    if (!prev || row.round < prev.round) picked.set(row.name, row);
  });
  return Array.from(picked.values()).sort((a, b) => a.round - b.round);
}

/* ------------------------------------------------------------------ */
/* 各类达成条件的扫描                                                    */
/* ------------------------------------------------------------------ */

/** 单局事件：遍历每个主账号的每一局，满足条件的那一局即为解锁点 */
function scanRoundEvent(ledger, predicate, describe) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    seq.items.forEach((item) => {
      if (!predicate(item)) return;
      const info = describe(item, seq);
      rows.push(unlock(seq, item, info.value, info.text, info.tail));
    });
  });
  return rows;
}

/**
 * 按周期（自然日 / 赛季）累计，累计额第一次跨过门槛的那一局即为解锁点。
 *
 * 注意别写「单局亏 ≥ N 倍底注」这类门槛：结算后剩余筹码最低就是 0，
 * 单局最大亏损恒等于一个底注，那种门槛永远不可能达成。
 *
 * @param {object} opts
 *   keyOf   —— 周期 key（自然日 / 赛季 code）
 *   labelOf —— 周期的可读标签
 *   goalOf  —— 门槛金额（分）
 *   hit     —— 累计额是否达标，默认正向（越大越好）
 */
function scanPeriodTotal(ledger, opts) {
  const rows = [];
  const hit = opts.hit || ((total, goal) => total >= goal);

  ledger.sequences.forEach((seq) => {
    const totals = new Map();
    seq.items.forEach((item) => {
      const key = opts.keyOf(item);
      if (!key) return;
      const total = (totals.get(key) || 0) + item.cents;
      totals.set(key, total);
      if (!hit(total, opts.goalOf(item))) return;
      const info = opts.describe(item, total, opts.labelOf(key, item));
      rows.push(unlock(seq, item, info.value, info.text, info.tail));
    });
  });
  return rows;
}

/** 连续战绩里用来念"第几场"的前缀 */
const STEM = { win: "赢下", lose: "输掉" };

/**
 * 连续 N 次同类结果。平局跳过（不打断也不计数）——与 streak.js 的折叠口径一致。
 */
function scanStreak(ledger, type, times) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let run = 0;
    seq.items.forEach((item) => {
      if (item.result === "deuce") return;
      if (item.result !== type) {
        run = 0;
        return;
      }
      run += 1;
      if (run !== times) return;
      const label = STREAK_LABEL[type] || "连胜";
      rows.push(
        unlock(seq, item, times, `${times}${label}`, `${STEM[type]}的第 ${times} 场`)
      );
    });
  });
  return rows;
}

/** 输光之后紧接着的下一局赢回来 */
function scanComeback(ledger) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    seq.items.forEach((item, index) => {
      if (!item.busted) return;
      const next = seq.items[index + 1];
      if (!next || next.cents <= 0) return;
      rows.push(
        unlock(
          seq,
          next,
          fromCents(next.cents),
          formatSigned(fromCents(next.cents)),
          `第 ${item.round} 局输光 · 第 ${next.round} 局赢回`
        )
      );
    });
  });
  return rows;
}

/** 累计次数类（输光次数） */
function scanCountTimes(ledger, times, predicate) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let count = 0;
    seq.items.forEach((item) => {
      if (!predicate(item)) return;
      count += 1;
      if (count !== times) return;
      rows.push(unlock(seq, item, times, `${times} 次`, ""));
    });
  });
  return rows;
}

/** 连续多少局没被打光 */
function scanSurvive(ledger, times) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let run = 0;
    seq.items.forEach((item) => {
      if (item.busted) {
        run = 0;
        return;
      }
      run += 1;
      if (run !== times) return;
      rows.push(unlock(seq, item, times, `${times} 局`, ""));
    });
  });
  return rows;
}

/** 胜率达标：累计到门槛局数之后，胜率第一次到线的那一局 */
function scanWinRate(ledger, minGames, minRate) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let games = 0;
    let wins = 0;
    seq.items.forEach((item) => {
      games += 1;
      if (item.result === "win") wins += 1;
      if (games < minGames) return;
      const rate = wins / games;
      if (rate < minRate) return;
      rows.push(
        unlock(seq, item, rate, `${(rate * 100).toFixed(1)}%`, `${games} 局`)
      );
    });
  });
  return rows;
}

/** 按自然日归堆：返回按日期升序的 [{key, items:[...]}] */
function groupByDay(items) {
  const buckets = new Map();
  items.forEach((item) => {
    const key = dayKey(item.time);
    if (!key) return;
    const bucket = buckets.get(key) || { key, items: [] };
    bucket.items.push(item);
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values());
}

/**
 * 「一网打尽」：单局打完，同桌其他主账号**全部是亏的**（不要求被打光）。
 * 不用「赢 ≥ N 倍底注」当门槛 —— 单局最多只能赢「人数 - 1」倍底注，
 * 小牌局永远差一口气，那会变成死章。
 */
function scanSweep(ledger) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    seq.items.forEach((item) => {
      // chips > 0 是必须的：同一主账号两个子账号同桌、其中一个输光时，
      // 归集后的筹码是 0，这时候发「通收全场 0.00」就成笑话了
      if (!item.allLose || item.result !== "win" || item.chips <= 0) return;
      rows.push(
        unlock(
          seq,
          item,
          fromCents(item.chips),
          formatSigned(fromCents(item.cents)),
          `全场独赢 · 收下 ${format(fromCents(item.chips))}`
        )
      );
    });
  });
  return rows;
}

/** 「零封之夜」：同一天打满 minGames 局，且局局都赢（平局算没赢，直接出局） */
function scanPerfectDay(ledger, minGames) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    groupByDay(seq.items).forEach((bucket) => {
      const games = bucket.items.length;
      if (games < minGames) return;
      if (!bucket.items.every((item) => item.result === "win")) return;
      const last = bucket.items[games - 1];
      const total = bucket.items.reduce((sum, item) => sum + item.cents, 0);
      rows.push(
        unlock(
          seq,
          last,
          games,
          `${games} 战全胜`,
          `${dayLabel(bucket.key)} ${games} 局全胜 · 净赚 ${format(
            fromCents(total)
          )}`
        )
      );
    });
  });
  return rows;
}

/**
 * 「常胜将军」：连续 days 个自然日，每天都净赚。
 * 只数真正上过桌的日子 —— 中间歇了几天不影响"（有打牌的）连续盈利日"。
 */
function scanProfitDays(ledger, days) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let run = 0;
    groupByDay(seq.items).forEach((bucket) => {
      const total = bucket.items.reduce((sum, item) => sum + item.cents, 0);
      if (total <= 0) {
        run = 0;
        return;
      }
      run += 1;
      if (run !== days) return;
      const last = bucket.items[bucket.items.length - 1];
      rows.push(
        unlock(
          seq,
          last,
          days,
          `${days} 天连赚`,
          `截至 ${dayLabel(bucket.key)} 连赚 ${days} 天`
        )
      );
    });
  });
  return rows;
}

/** 「盆满钵满」：生涯累计净赚到底注的若干倍（黑章「慈善家」的正向兄弟） */
function scanLifetimeGain(ledger, mult) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let total = 0;
    seq.items.forEach((item) => {
      total += item.cents;
      if (item.stake <= 0) return;
      if (total < item.stake * mult) return;
      rows.push(
        unlock(
          seq,
          item,
          fromCents(total),
          formatSigned(fromCents(total)),
          `累计已赚 ${format(fromCents(total))}`
        )
      );
    });
  });
  return rows;
}

/** 「牌桌老炮」：累计出场满 times 局 */
function scanTotalGames(ledger, times) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    seq.items.forEach((item, index) => {
      if (index + 1 !== times) return;
      rows.push(unlock(seq, item, times, `${times} 局`, ""));
    });
  });
  return rows;
}

/** 生涯累计亏到底注的若干倍 */
function scanLifetimeLoss(ledger, mult) {
  const rows = [];
  ledger.sequences.forEach((seq) => {
    let total = 0;
    seq.items.forEach((item) => {
      total += item.cents;
      if (item.stake <= 0) return;
      if (total > -item.stake * mult) return;
      rows.push(
        unlock(
          seq,
          item,
          fromCents(total),
          formatSigned(fromCents(total)),
          `累计已亏 ${format(fromCents(-total))}`
        )
      );
    });
  });
  return rows;
}

/**
 * 赛季冠军：某个赛季的积分第一（至少打够 CHAMPION_MIN_GAMES 局）。
 *
 * ⚠️ 只有**已经收官**的赛季才发奖（`isSeasonClosed`）——赛季进行中谁领先都是虚的，
 * 中途领先的人拿了章、最后被反超，墙上就是两条互相打架的记录。
 * 解锁时刻记在**收官点**（赛季区间右端）而不是某一局：赛季是三个月的长周期，
 * 归因到某一局没有意义，收官后第一局结算时它才会冒出来，正好提示 + 发券。
 */
function scanChampion(history, players, minGames, now = Date.now()) {
  const seasons = listSeasons(history, now);
  const sequences = buildStreakSequences(history, players);
  const rows = [];

  seasons.forEach((season) => {
    if (!isSeasonClosed(season, now)) return;
    const report = buildSeasonReport(history, players, season);
    const champion = (report.ranking || [])[0];
    if (!champion || champion.games < minGames) return;

    const seq = sequences.find((item) => item.name === champion.name);
    if (!seq) return;
    const own = seq.items.filter(
      (item) => (seasonOf(item.time) || {}).code === season.code
    );
    if (!own.length) return;
    const last = own[own.length - 1];
    const closedAt = seasonEndAt(season);

    rows.push({
      name: champion.name,
      round: last.round,
      time: Math.max(closedAt, last.time),
      // season.label 自带年份（"2026 春"），别再前缀一次；report 里的 score 已经是「元」
      value: champion.score,
      text: formatSigned(champion.score),
      detail: `${season.label}季冠军 · ${formatDate(closedAt)} 收官`,
    });
  });

  return rows;
}

/* ------------------------------------------------------------------ */
/* 勋章定义                                                             */
/* ------------------------------------------------------------------ */

/**
 * 每项：`hint(stake)` 生成"要达成什么"的文案，`scan(ledger, ctx)` 返回所有达成记录
 * （同一人多次达成由 `buildAchievements` 统一取最早一次）。
 */
const ACHIEVEMENT_DEFS = [
  // ⚠️ 原本这里有「首胜」（firstBlood），用户要求撤掉：赢过一局太普通，不值得单独发一枚章。
  ...ROUND_MULT.map((mult, index) => ({
    key: `round${mult}x`,
    title: ["小胜一场", "赢得痛快", "通杀全场"][index],
    icon: "el-icon-coin",
    tier: ["bronze", "silver", "gold"][index],
    kind: "glory",
    hint: (stake) => `单局赢 ≥ ${format(fromCents(stake * mult))}（${mult} 倍底注）`,
    scan: (ledger) =>
      scanRoundEvent(
        ledger,
        (item) => item.cents >= item.stake * mult,
        (item) => ({
          value: fromCents(item.cents),
          text: formatSigned(fromCents(item.cents)),
        })
      ),
  })),
  {
    key: "day5x",
    title: "一日暴富",
    icon: "el-icon-sunny",
    tier: "silver",
    kind: "glory",
    hint: (stake) => `同一天累计赢 ≥ ${format(fromCents(stake * DAY_MULT))}`,
    scan: (ledger) =>
      scanPeriodTotal(ledger, {
        keyOf: (item) => dayKey(item.time),
        labelOf: (key) => dayLabel(key),
        goalOf: (item) => item.stake * DAY_MULT,
        describe: (item, total, label) => ({
          value: fromCents(total),
          text: formatSigned(fromCents(total)),
          tail: `${label} 累计`,
        }),
      }),
  },
  {
    key: "season10x",
    title: "赛季大赢家",
    icon: "el-icon-trophy",
    tier: "gold",
    kind: "glory",
    hint: (stake) => `单个赛季累计赢 ≥ ${format(fromCents(stake * SEASON_MULT))}`,
    scan: (ledger) =>
      scanPeriodTotal(ledger, {
        keyOf: (item) => (seasonOf(item.time) || {}).code || "",
        labelOf: (key, item) => (seasonOf(item.time) || {}).label || "—",
        goalOf: (item) => item.stake * SEASON_MULT,
        describe: (item, total, label) => ({
          value: fromCents(total),
          text: formatSigned(fromCents(total)),
          tail: `${label}季累计`,
        }),
      }),
  },
  {
    key: "champion",
    title: "赛季冠军",
    icon: "el-icon-medal",
    tier: "gold",
    kind: "glory",
    hint: () => `赛季收官后积分第一（至少 ${CHAMPION_MIN_GAMES} 局）`,
    scan: (ledger, ctx) =>
      scanChampion(ctx.history, ctx.players, CHAMPION_MIN_GAMES, ctx.now),
  },
  {
    key: "comeback",
    title: "翻盘",
    icon: "el-icon-refresh",
    tier: "silver",
    kind: "glory",
    hint: () => "输光的下一局就赢回来",
    scan: (ledger) => scanComeback(ledger),
  },
  {
    key: "halfTable",
    title: "半壁江山",
    icon: "el-icon-aim",
    tier: "gold",
    kind: "glory",
    hint: () => "单局结束时手里握着桌上过半筹码",
    scan: (ledger) =>
      scanRoundEvent(
        ledger,
        (item) =>
          item.result === "win" &&
          item.pot > 0 &&
          item.chips >= item.pot * HALF_TABLE_RATIO,
        (item) => ({
          value: fromCents(item.chips),
          text: formatSigned(fromCents(item.cents)),
          tail: `收下 ${format(fromCents(item.chips))} / 全场 ${format(
            fromCents(item.pot)
          )}`,
        })
      ),
  },
  {
    key: `survive${SURVIVE_TIMES}`,
    title: "不死之身",
    icon: "el-icon-success",
    tier: "silver",
    kind: "glory",
    hint: () => `连续 ${SURVIVE_TIMES} 局没被打光`,
    scan: (ledger) => scanSurvive(ledger, SURVIVE_TIMES),
  },
  {
    key: "sharpshooter",
    title: "神射手",
    icon: "el-icon-odometer",
    tier: "gold",
    kind: "glory",
    hint: () =>
      `至少 ${RATE_MIN_GAMES} 局，且胜率 ≥ ${(RATE_MIN * 100).toFixed(0)}%`,
    scan: (ledger) => scanWinRate(ledger, RATE_MIN_GAMES, RATE_MIN),
  },
  {
    key: "sweep",
    title: "一网打尽",
    icon: "el-icon-full-screen",
    tier: "gold",
    kind: "glory",
    hint: () => "单局打完，同桌其他人全部输钱",
    scan: (ledger) => scanSweep(ledger),
  },
  {
    key: "perfectDay",
    title: "零封之夜",
    icon: "el-icon-moon",
    tier: "silver",
    kind: "glory",
    hint: () => `同一天打满 ${PERFECT_DAY_MIN_GAMES} 局且局局都赢`,
    scan: (ledger) => scanPerfectDay(ledger, PERFECT_DAY_MIN_GAMES),
  },
  {
    key: "profitDays",
    title: "常胜将军",
    icon: "el-icon-medal-1",
    tier: "silver",
    kind: "glory",
    hint: () => `连续 ${PROFIT_DAYS} 个比赛日，每天都净赚`,
    scan: (ledger) => scanProfitDays(ledger, PROFIT_DAYS),
  },
  {
    key: "lifetime20x",
    title: "盆满钵满",
    icon: "el-icon-s-finance",
    tier: "gold",
    kind: "glory",
    hint: (stake) =>
      `生涯累计净赚 ≥ ${format(fromCents(stake * GAIN_MULT))}（${GAIN_MULT} 倍底注）`,
    scan: (ledger) => scanLifetimeGain(ledger, GAIN_MULT),
  },
  {
    key: `veteran${VETERAN_GAMES}`,
    title: "牌桌老炮",
    icon: "el-icon-user-solid",
    tier: "bronze",
    kind: "glory",
    hint: () => `累计出场满 ${VETERAN_GAMES} 局`,
    scan: (ledger) => scanTotalGames(ledger, VETERAN_GAMES),
  },

  /* ---------------- 连胜勋章：3 ~ 10 连胜，独立成组 ---------------- */

  ...STREAK_STEPS.map((times, index) => ({
    key: `streak${times}`,
    title: STREAK_TITLES[index] || `${times} 连胜`,
    icon: STREAK_ICONS[index] || "el-icon-s-flag",
    // 3~5 铜、6~8 银、9~10 金：越连越值钱
    tier: index < 3 ? "bronze" : index < 6 ? "silver" : "gold",
    kind: "streak",
    hint: () => `连续 ${times} 场不败（平局不计也不打断）`,
    scan: (ledger) => scanStreak(ledger, "win", times),
  })),

  /* ---------------- 黑勋章：调侃向 ---------------- */

  ...BUSTED_STEPS.map((times, index) => ({
    key: `busted${times}`,
    title: times === 5 ? "洗白日常" : "职业送财",
    icon: index === 0 ? "el-icon-warning-outline" : "el-icon-error",
    tier: index === 0 ? "bronze" : "silver",
    kind: "dark",
    hint: () => `累计被打光 ${times} 次`,
    scan: (ledger) => scanCountTimes(ledger, times, (item) => item.busted),
  })),
  {
    key: `lose${LOSE_STREAK_TIMES}`,
    title: "连败大师",
    icon: "el-icon-caret-bottom",
    tier: "bronze",
    kind: "dark",
    hint: () => `连续 ${LOSE_STREAK_TIMES} 场没赢过`,
    scan: (ledger) => scanStreak(ledger, "lose", LOSE_STREAK_TIMES),
  },
  {
    key: "dayNeg5x",
    title: "一日散财",
    icon: "el-icon-bottom",
    tier: "silver",
    kind: "dark",
    hint: (stake) => `同一天累计亏 ≥ ${format(fromCents(stake * NEG_DAY_MULT))}`,
    scan: (ledger) =>
      scanPeriodTotal(ledger, {
        keyOf: (item) => dayKey(item.time),
        labelOf: (key) => dayLabel(key),
        goalOf: (item) => item.stake * NEG_DAY_MULT,
        hit: (total, goal) => total <= -goal,
        describe: (item, total, label) => ({
          value: fromCents(total),
          text: formatSigned(fromCents(total)),
          tail: `${label} 累计`,
        }),
      }),
  },
  {
    key: "philanthropist",
    title: "慈善家",
    icon: "el-icon-money",
    tier: "gold",
    kind: "dark",
    hint: (stake) => `生涯累计亏 ≥ ${format(fromCents(stake * LOSS_MULT))}`,
    scan: (ledger) => scanLifetimeLoss(ledger, LOSS_MULT),
  },
];

/** UI 分区顺序与标题 */
export const ACHIEVEMENT_GROUPS = [
  { key: "glory", title: "荣誉勋章", hint: "凭本事赢下来的" },
  { key: "streak", title: "连胜勋章", hint: "3 ~ 10 连胜，一波带走" },
  { key: "dark", title: "黑勋章", hint: "输了也要留个名" },
];

/**
 * 全部勋章一次算全（顺序同 ACHIEVEMENT_DEFS）。
 *
 * @param {Array} history 对局流水
 * @param {Array} players 全量玩家
 * @param {{now?: number}} [options] now 可注入，单测里卡时间用；默认取当前时间。
 *   ⚠️ 赛季冠军靠它判断赛季是否收官，别漏传。
 * @returns {Array<{key,title,icon,tier,kind,hint,unlocked:boolean,
 *                  owners:Array<object>,first:object|null}>}
 *   owners —— 拿到过这枚章的人，按达成先后排序；`first` 即「首杀」那一位
 */
export function buildAchievements(history, players, options) {
  const roster = Array.isArray(players) ? players : [];
  const ledger = buildLedger(history, roster);
  const ctx = {
    history,
    players: roster,
    now: (options && Number(options.now)) || Date.now(),
  };
  const stake = ledger.stake;

  return ACHIEVEMENT_DEFS.map((def) => {
    const rows = firstTimeEach(def.scan(ledger, ctx) || []);
    return {
      key: def.key,
      title: def.title,
      icon: def.icon,
      tier: def.tier,
      kind: def.kind,
      hint: def.hint(stake),
      unlocked: rows.length > 0,
      owners: rows,
      first: rows.length ? rows[0] : null,
    };
  });
}

/** 按 UI 分区打包：荣誉 / 黑勋章 */
export function groupAchievements(achievements) {
  const list = Array.isArray(achievements) ? achievements : [];
  return ACHIEVEMENT_GROUPS.map((group) => ({
    ...group,
    items: list.filter((item) => item.kind === group.key),
  })).filter((group) => group.items.length);
}

/**
 * 个人墙：把勋章按人聚合。
 * @returns {Array<{name, count, glory:number, streak:number, dark:number, medals:Array}>}
 *   medals 按达成先后（round 升序）排列
 */
export function buildMedalWall(achievements) {
  const list = Array.isArray(achievements) ? achievements : [];
  const rows = new Map();

  list.forEach((item) => {
    (item.owners || []).forEach((owner) => {
      const entry = rows.get(owner.name) || {
        name: owner.name,
        count: 0,
        glory: 0,
        streak: 0,
        dark: 0,
        medals: [],
      };
      entry.count += 1;
      if (item.kind === "dark") entry.dark += 1;
      else if (item.kind === "streak") entry.streak += 1;
      else entry.glory += 1;
      entry.medals.push({
        key: item.key,
        title: item.title,
        icon: item.icon,
        tier: item.tier,
        kind: item.kind,
        round: owner.round,
        time: owner.time,
        detail: owner.detail,
      });
      rows.set(entry.name, entry);
    });
  });

  return Array.from(rows.values())
    .map((entry) => ({
      ...entry,
      medals: entry.medals.slice().sort((a, b) => a.round - b.round),
    }))
    .sort((a, b) => b.count - a.count || compareName(a.name, b.name));
}

/**
 * 总览进度：解锁了几枚、一共几枚。
 * 「参与人数」取所有拿过章的人，不是全部学员 —— 一个人没章就不该出现在墙上。
 */
export function achievementProgress(achievements, wall) {
  const list = Array.isArray(achievements) ? achievements : [];
  const owners = Array.isArray(wall) ? wall : [];
  return {
    total: list.length,
    unlocked: list.filter((item) => item.unlocked).length,
    percent: list.length
      ? Math.round((list.filter((item) => item.unlocked).length / list.length) * 100)
      : 0,
    players: owners.length,
  };
}

/** 段位样式：金 / 银 / 铜 */
export function tierClass(tier) {
  if (tier === "gold") return "tier tier--gold";
  if (tier === "silver") return "tier tier--silver";
  return "tier tier--bronze";
}

/**
 * 兜底排序用的名字比较。
 * 别用 `localeCompare`：中日韩的排序规则在 Node 与各浏览器里不一致，会名次抖动。
 */
function compareName(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
