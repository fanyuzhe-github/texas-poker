/**
 * 排行榜累计逻辑：与结算解耦，纯函数。
 */
import { toCents, fromCents } from "./money.js";

/**
 * 把一局的结果累计到排行榜上（不修改入参，返回新数组）。
 *
 * 重要：这里只把战绩记在实际参与牌局的账号（子账号 / 独立玩家）头上，
 * **不往主账号上累加**。主账号的汇总积分一律由 buildMainRanking 在展示时
 * 实时算出。若两边都累加，胜负场次和积分会翻倍。
 * 这样设计的好处是子账号解除归属后，主账号的汇总值立刻自动正确，无需回滚。
 *
 * @param {Array} players 排行榜玩家列表
 * @param {Array<{name, delta, result}>} records 本局结果
 * @param {{at?: number}} [options] at 用于指定本局时间戳（重放历史时用局的 time，
 *        好让结果可复现）；不给就用当前时间。
 * @returns {Array} 按积分降序排列的新数组
 */
export function applyOutcome(players, records, options) {
  const list = Array.isArray(players) ? players : [];
  const outcomes = Array.isArray(records) ? records : [];
  const opts = options && typeof options === "object" ? options : {};
  // 同一局的落库时间戳必须一致，重放历史时才算得准「谁是最新的战绩来源」
  const at = Number.isFinite(opts.at) ? opts.at : Date.now();

  const next = list.map((player) => {
    const record = outcomes.find((item) => item.name === player.name);
    if (!record) return { ...player };

    const raceResult = {
      win: toInt(player.raceResult && player.raceResult.win),
      lose: toInt(player.raceResult && player.raceResult.lose),
      deuce: toInt(player.raceResult && player.raceResult.deuce),
    };
    raceResult[record.result] = (raceResult[record.result] || 0) + 1;

    let lastState = player.lastState || "deuce";
    let stateTimes = toInt(player.stateTimes);

    // 平局不改变连胜/连败状态
    if (record.result !== "deuce") {
      stateTimes = record.result === lastState ? stateTimes + 1 : 1;
      lastState = record.result;
    }

    return {
      ...player,
      score: fromCents(toCents(player.score) + toCents(record.delta)),
      raceResult,
      lastState,
      stateTimes,
      // 供 buildMainRanking 判断谁是最新的战绩来源
      raceDate: at,
    };
  });

  return next.sort((a, b) => b.score - a.score);
}

/**
 * 战绩重放：把一批流水从零重新累计到名册上，得到一份「只反映这些流水」的玩家表。
 *
 * 用途是修数据 —— 删除某一局、清空流水之后，必须让总榜跟着回滚，
 * 否则积分/场次/连胜会继续按「已经不存在的流水」算，而且无法自愈。
 * 增量累加（applyOutcome）只能往前推，做不到往回退，所以只能整体重放。
 *
 * ⚠️ 只重建**战绩字段**（score / raceResult / lastState / stateTimes / raceDate），
 *    其余字段（头像、归属 parent、是否主账号、排序号）原样保留。
 * ⚠️ 流水里出现过、但名册里已经没有的账号会被忽略 —— 玩家删了战绩就作废。
 * ⚠️ 名册里从没上过桌的账号会保留下来，战绩归零。
 *
 * @param {Array} history 流水（任意顺序，内部按 time 升序重放）
 * @param {Array} players 名册
 * @param {{filter?: (game) => boolean}} [options] filter 用于只重放部分流水
 *        （今日榜只认当天打的局）
 * @returns {Array} 按积分降序排列的新数组
 */
export function rebuildPlayersFromHistory(history, players, options) {
  const opts = options && typeof options === "object" ? options : {};
  const keep = typeof opts.filter === "function" ? opts.filter : null;
  const games = (Array.isArray(history) ? history : [])
    .filter((game) => game && Array.isArray(game.records))
    .filter((game) => !keep || keep(game) === true)
    .slice()
    .sort((a, b) => toInt(a.time) - toInt(b.time));

  const roster = Array.isArray(players) ? players : [];
  const names = new Set(roster.map((player) => player.name));

  let next = roster.map(resetRaceStats);

  games.forEach((game) => {
    const records = game.records
      .filter((record) => record && names.has(record.name))
      .map((record) => ({
        name: record.name,
        delta: record.delta,
        result: VALID_RESULTS.has(record.result) ? record.result : "deuce",
      }));
    if (!records.length) return;
    next = applyOutcome(next, records, { at: toInt(game.time) });
  });

  return next;
}

/** 把一个账号的战绩清零，其余字段保留 */
function resetRaceStats(player) {
  return {
    ...player,
    score: 0,
    raceResult: { win: 0, lose: 0, deuce: 0 },
    lastState: "deuce",
    stateTimes: 0,
    raceDate: 0,
  };
}

/** 取某个主账号名下的子账号列表 */
export function childrenOf(players, mainName) {
  const list = Array.isArray(players) ? players : [];
  return list.filter((player) => player.parent === mainName);
}

/**
 * 分组容器：名下挂着子账号的顶层账号。
 * ⚠️ 2026-10-20 起这类号**只做积分汇总、不能上桌**（canSit 会拦下它）。
 *    名下没有子账号的主账号不算容器，等同独立号，可以自己下场。
 */
export function isGroupOnly(player, players) {
  return !player.parent && childrenOf(players, player.name).length > 0;
}

/**
 * 显式创建的主账号：名下可以有子账号，也可以暂时一个都没有。
 * 注意与「独立号」区分 —— 独立号同样是顶层账号（parent 为空），
 * 但它没有被标记成主账号。
 *
 * ⚠️ 这个标记**不再决定能不能上桌**：上桌口径只看有没有子账号（见 canSit）。
 */
export function isMainAccount(player) {
  return !player.parent && player.isMain === true;
}

/**
 * 这个号能不能上桌（上桌 = 出现在选人列表里、能开局）。
 *
 * ⚠️ 规则（2026-10-20 用户定）：
 *   - 名下**挂着子账号**的主账号 = 只做积分汇总的分组容器，**不能**亲自上桌；
 *   - 名下**没有**子账号的主账号等同独立号，**可以**上桌（它还没开始汇总谁的账）。
 *
 * 判定只看「有没有别的号认它当 parent」，不看 isMain 标记 ——
 * 老数据里 isMain 可能缺失，但 parent 指向不会说谎（storage 还会按有无子账号反推）。
 * 名册外的新昵称一律放行：下拉框 allow-create 现敲的名字不是「谁的主账号」。
 */
export function canSit(players, name) {
  const list = Array.isArray(players) ? players : [];
  const target = String(name == null ? "" : name).trim();
  if (!target) return false;
  return !list.some((item) => item && item.parent === target);
}

/**
 * 可上桌的账号名列表（选人下拉框的数据源）。
 *
 * 主账号自己下场时战绩记在自己头上，总榜汇总（自身 + 子账号）天然包含这部分，
 * 不存在重复计算 —— 见 buildMainRanking 的 members = [main, ...children]。
 *
 * 「同一个主账号一局只能出一个号」交给 limitOnePerMain：
 * 主账号和它的子账号算同一组，同时选中时只保留最后选的那个，避免左右互搏。
 */
export function selectableNames(players) {
  const list = Array.isArray(players) ? players : [];
  return list
    .filter((player) => canSit(list, player.name))
    .map((player) => player.name);
}

/**
 * 今日榜：直接按「今天上桌的号」排名 —— 子账号就是子账号，独立号就是独立号，
 * 不做主账号归集，谁坐在桌前就显示谁。
 * 战绩本来就是记在实际账号头上（见 applyOutcome），这里只排序，不存在翻倍。
 *
 * @param {Array} players 今日榜累计列表
 * @param {Array} [roster] 总库，用来剔除历史遗留的分组容器脏数据
 * @returns {Array} 按积分降序排列
 */
export function buildTodayRanking(players, roster) {
  const list = Array.isArray(players) ? players : [];
  const base = Array.isArray(roster) && roster.length ? roster : list;

  return list
    .filter((player) => {
      // 分组容器（名下挂着子账号）默认不进今日榜，历史脏数据兜底；
      // 但只要它今天真下了场 —— 看**今日榜这一行自己**的战绩，一律保留
      return canSit(base, player.name) || totalGames(player) > 0;
    })
    .sort((a, b) => b.score - a.score);
}

function totalGames(player) {
  const result = player.raceResult || {};
  return (
    toInt(result.win) + toInt(result.lose) + toInt(result.deuce)
  );
}

/**
 * 今日结算的领奖台：取今日榜前三名。
 * 展示顺序按领奖台惯例排成「亚军 - 冠军 - 季军」（冠军在中间最高），
 * 不足三人时缺哪位就少哪位，绝不硬凑。
 *
 * @param {Array} ranking 今日榜（已按积分降序）
 * @param {Array} [roster] 总库，用来把上桌的子账号归到主账号名下领奖
 * @returns {Array<{rank, name, owner, parent, score, games, win, lose, deuce}>}
 */
export function buildDailyPodium(ranking, roster) {
  const list = Array.isArray(ranking) ? ranking : [];
  const players = Array.isArray(roster) && roster.length ? roster : list;

  const top = list.slice(0, 3).map((player, index) => {
    const result = player.raceResult || {};
    return {
      rank: index + 1,
      name: player.name,
      // 卡包挂在主账号名下，子账号上台领奖也是发给它的主人
      owner: mainOf(players, player.name) || player.name,
      parent: player.parent || null,
      // 透传给领奖台上的头像组件，脏值由它那边清洗
      avatar: typeof player.avatar === "string" ? player.avatar : "",
      score: toInt(player.score),
      games: totalGames(player),
      win: toInt(result.win),
      lose: toInt(result.lose),
      deuce: toInt(result.deuce),
    };
  });

  return [top[1], top[0], top[2]].filter(Boolean);
}

/**
 * 某个账号归属的主账号名。
 * 自己就是主账号时返回自己，查不到（还没入库）时也返回自己。
 */
export function mainOf(players, name) {
  const list = Array.isArray(players) ? players : [];
  const player = list.find((item) => item.name === name);
  if (!player || !player.parent) return name;
  return player.parent;
}

/**
 * 同一个主账号（它自己 + 名下所有子账号）在牌桌上只能出一个号，
 * 否则就是同一个人左右互搏，结算出来的转账方案没有意义。
 *
 * 保留**最后**被选中的那个（用户最新的意图），把同组的其他号剔除，
 * 其余选择保持原有顺序，避免座位顺序被打乱。
 */
export function limitOnePerMain(players, selectedNames) {
  const list = Array.isArray(players) ? players : [];
  const names = Array.isArray(selectedNames) ? selectedNames.filter(Boolean) : [];

  const kept = [];
  for (let i = names.length - 1; i >= 0; i -= 1) {
    const name = names[i];
    const group = mainOf(list, name);
    if (kept.some((item) => mainOf(list, item) === group)) continue;
    kept.unshift(name);
  }
  return kept;
}

/**
 * 把扁平玩家表归集成「只含主账号」的榜单。
 * 主账号积分 = 自身历史积分 + 名下所有子账号积分之和。
 * 子账号明细挂在 children 字段上，供表格展开查看。
 *
 * @returns {Array} 按汇总积分降序排列
 */
export function buildMainRanking(players) {
  const raw = Array.isArray(players) ? players : [];
  const names = new Set(raw.map((player) => player.name));

  // 防御：parent 指向的账号不在本列表里（例如今日榜没带主账号），
  // 就把它降级为独立玩家，避免这条战绩在榜单上凭空消失
  const list = raw.map((player) =>
    player.parent && !names.has(player.parent)
      ? { ...player, parent: null }
      : player
  );

  const mains = list.filter((player) => !player.parent);

  return mains
    .map((main) => {
      const children = childrenOf(list, main.name);
      // 主账号在挂子账号之前若自己上过桌，那部分积分也要算进来
      const members = [main, ...children];

      let score = 0;
      const raceResult = { win: 0, lose: 0, deuce: 0 };
      members.forEach((member) => {
        score += toCents(member.score);
        const result = member.raceResult || {};
        raceResult.win += toInt(result.win);
        raceResult.lose += toInt(result.lose);
        raceResult.deuce += toInt(result.deuce);
      });

      // 连胜/连败取最近一次有结果的成员状态
      const latest = members.reduce(
        (acc, member) =>
          !acc || toInt(member.raceDate) > toInt(acc.raceDate) ? member : acc,
        null
      );

      return {
        ...main,
        score: fromCents(score),
        raceResult,
        lastState: latest ? latest.lastState || "deuce" : "deuce",
        stateTimes: latest ? toInt(latest.stateTimes) : 0,
        children,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 确保一批玩家都存在于排行榜中，缺失的按初始值补齐。
 * 回调收到的 index 是「本次新增的连续序号」，不是数组下标，
 * 否则与工厂函数自身的偏移叠加会让座位号跳号。
 */
export function ensurePlayers(ranking, names, createPlayer) {
  const list = Array.isArray(ranking) ? [...ranking] : [];
  const base = list.length;
  let added = 0;

  names.forEach((name) => {
    if (!name) return;
    const exists = list.some((player) => player.name === name);
    if (!exists) {
      list.push(createPlayer(base + added, name));
      added += 1;
    }
  });

  return list;
}

/** 合法的胜负判定，重放流水时用来挡脏数据 */
const VALID_RESULTS = new Set(["win", "lose", "deuce"]);

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 胜负场次展示 */
export function formatRecord(row) {
  const result = row.raceResult || {};
  return `${result.win || 0} / ${result.lose || 0}`;
}

/** 胜率展示 */
export function formatWinRate(row) {
  const result = row.raceResult || {};
  const total = (result.win || 0) + (result.lose || 0) + (result.deuce || 0);
  if (!total) return "—";
  return `${(((result.win || 0) / total) * 100).toFixed(1)}%`;
}

/** 连胜/连败状态展示 */
export function formatState(row) {
  const times = Number(row.stateTimes) || 0;
  if (!times) return "—";
  return `${times}连${row.lastState === "lose" ? "败" : "胜"}`;
}
