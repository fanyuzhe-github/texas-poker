/**
 * 战绩重放：删除/清空流水后，总榜必须跟着回滚。
 * 用真实 core（已同步到本目录）验证。
 */
import {
  applyOutcome,
  rebuildPlayersFromHistory,
  buildMainRanking,
} from "../src/core/ranking.js";

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}\n      实际 ${a}\n      期望 ${e}`);
  }
}

function P(name, extra) {
  return { name, score: 0, parent: "", ...extra };
}

function G(time, rows) {
  return {
    id: `g${time}`,
    time,
    baseChips: 10,
    records: rows.map(([name, delta, result]) => ({ name, delta, result })),
  };
}

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const T1 = T0 + 3600000;
const T2 = T0 + 7200000;
const T3 = T0 + 10800000;

const games = [
  G(T1, [["小明", 10, "win"], ["小红", -10, "lose"]]),
  G(T2, [["小明", -4, "lose"], ["小红", 4, "win"]]),
  G(T3, [["小明", 7, "win"], ["小红", -7, "lose"]]),
];
const roster = () => [P("小明"), P("小红")];

const statOf = (list, name) => {
  const p = list.find((x) => x.name === name);
  return {
    score: p.score,
    win: (p.raceResult || {}).win || 0,
    lose: (p.raceResult || {}).lose || 0,
    stateTimes: p.stateTimes || 0,
    lastState: p.lastState || "",
  };
};

console.log("[1] 重放全部 = 逐局增量累加的结果");
{
  let stepped = roster();
  games.forEach((g) => {
    stepped = applyOutcome(stepped, g.records, { at: g.time });
  });
  const replayed = rebuildPlayersFromHistory(games, roster());
  check("小明 13 分 / 2 胜 1 负 / 1 连胜", statOf(replayed, "小明"), {
    score: 13,
    win: 2,
    lose: 1,
    stateTimes: 1,
    lastState: "win",
  });
  check("与增量累加完全一致", statOf(replayed, "小明"), statOf(stepped, "小明"));
  check("小红 -13 分", statOf(replayed, "小红"), {
    score: -13,
    win: 1,
    lose: 2,
    stateTimes: 1,
    lastState: "lose",
  });
}

console.log("\n[2] 删掉最后一局 → 战绩回到前两局的样子");
{
  const left = games.slice(0, 2);
  const replayed = rebuildPlayersFromHistory(left, roster());
  check("小明 6 分 / 1 胜 1 负 / 1 连败", statOf(replayed, "小明"), {
    score: 6,
    win: 1,
    lose: 1,
    stateTimes: 1,
    lastState: "lose",
  });
  check("小红 -6 分", statOf(replayed, "小红"), {
    score: -6,
    win: 1,
    lose: 1,
    stateTimes: 1,
    lastState: "win",
  });
}

console.log("\n[3] 删掉中间那局 → 连胜状态要按剩下的顺序重算");
{
  const left = [games[0], games[2]];
  const replayed = rebuildPlayersFromHistory(left, roster());
  check("小明 17 分 / 2 连胜", statOf(replayed, "小明"), {
    score: 17,
    win: 2,
    lose: 0,
    stateTimes: 2,
    lastState: "win",
  });
  check("小红 -17 分 / 2 连败", statOf(replayed, "小红"), {
    score: -17,
    win: 0,
    lose: 2,
    stateTimes: 2,
    lastState: "lose",
  });
}

console.log("\n[4] 清空流水 → 全归零");
{
  const replayed = rebuildPlayersFromHistory([], roster());
  check("小明清零", statOf(replayed, "小明"), {
    score: 0,
    win: 0,
    lose: 0,
    stateTimes: 0,
    lastState: "deuce",
  });
  check("小红清零", statOf(replayed, "小红"), {
    score: 0,
    win: 0,
    lose: 0,
    stateTimes: 0,
    lastState: "deuce",
  });
}

console.log("\n[5] 流水顺序打乱也能重放正确（按 time 升序）");
{
  const shuffled = [games[2], games[0], games[1]];
  const replayed = rebuildPlayersFromHistory(shuffled, roster());
  check("小明仍为 13 分 / 1 连胜", statOf(replayed, "小明"), {
    score: 13,
    win: 2,
    lose: 1,
    stateTimes: 1,
    lastState: "win",
  });
}

console.log("\n[6] 非战绩字段必须保留（头像 / 归属 / 主账号标记）");
{
  const rich = [
    P("小明", { avatar: "card:c007", isMain: true }),
    P("小明的号", { parent: "小明", avatar: "card:c011" }),
  ];
  const g = [G(T1, [["小明的号", 20, "win"]])];
  const out = rebuildPlayersFromHistory(g, rich);
  const sub = out.find((x) => x.name === "小明的号");
  check("子号头像保留", sub.avatar, "card:c011");
  check("子号 parent 保留", sub.parent, "小明");
  const main = out.find((x) => x.name === "小明");
  check("主账号标记保留", main.isMain, true);
  check("主账号头像保留", main.avatar, "card:c007");
  check(
    "总榜汇总能看到子号的 20 分",
    buildMainRanking(out)[0].score,
    20
  );
}

console.log("\n[7] 流水里有但名册已删的人 → 忽略，不凭空造账号");
{
  const g = [
    G(T1, [["小明", 10, "win"], ["幽灵", -10, "lose"]]),
  ];
  const out = rebuildPlayersFromHistory(g, roster());
  check("名册人数不变", out.length, 2);
  check("没有幽灵账号", out.some((x) => x.name === "幽灵"), false);
  check("小明仍有 10 分", out.find((x) => x.name === "小明").score, 10);
}

console.log("\n[8] 脏 result 兜底为平局，不写坏凤 raceResult");
{
  const dirty = [
    {
      id: "x",
      time: T1,
      records: [{ name: "小明", delta: 5, result: "???", chips: 15 }],
    },
  ];
  const out = rebuildPlayersFromHistory(dirty, roster());
  const xm = out.find((x) => x.name === "小明");
  check("result 兜底成 deuce", xm.raceResult, { win: 0, lose: 0, deuce: 1 });
  check("分数照常累加", xm.score, 5);
}

console.log("\n[9] 今日榜口径：只重放当天的局");
{
  const today = new Date();
  const todayAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 21, 0, 0).getTime();
  const daysAgo = todayAt - 3 * 86400000;
  const mixed = [
    G(daysAgo, [["小明", 50, "win"]]),
    G(todayAt, [["小明", -3, "lose"]]),
  ];
  const keyOf = new Date(todayAt).toDateString();
  const filter = (g) => new Date(g.time).toDateString() === keyOf;
  const out = rebuildPlayersFromHistory(mixed, roster(), { filter });
  check("今日榜只认今天那局", out.find((x) => x.name === "小明").score, -3);
  check(
    "不加筛选则是全部",
    rebuildPlayersFromHistory(mixed, roster()).find((x) => x.name === "小明").score,
    47
  );
}

console.log("\n[10] 平局不打断连胜，也不计入连胜次数");
{
  const gs = [
    G(T1, [["小明", 1, "win"]]),
    G(T2, [["小明", 0, "deuce"]]),
    G(T3, [["小明", 1, "win"]]),
  ];
  const out = rebuildPlayersFromHistory(gs, roster());
  check(
    "两连胜（平局不打断也不计次）",
    statOf(out, "小明"),
    { score: 2, win: 2, lose: 0, stateTimes: 2, lastState: "win" }
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail) process.exitCode = 1;
