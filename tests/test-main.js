/**
 * 主账号不可上桌 + 今日榜按上桌的号排名
 *
 * ⚠️ 2026-10-20 起的口径：能不能上桌**只看名下有没有子账号** ——
 *   挂了子账号的主账号是汇总容器，不上桌；名下没子账号的主账号等同独立号，可以上桌。
 *   isMain 标记不再决定上桌资格。
 */
import {
  selectableNames,
  canSit,
  isMainAccount,
  buildTodayRanking,
  buildMainRanking,
  applyOutcome,
} from "../src/core/ranking.js";

let pass = 0;
let fail = 0;

function check(title, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${title}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${title}\n      期望 ${b}\n      实际 ${a}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

const P = (name, parent = null, isMain = false, score = 0) => ({
  name,
  parent,
  isMain,
  score,
  raceResult: { win: 0, lose: 0, deuce: 0 },
  lastState: "deuce",
  stateTimes: 0,
  raceDate: 1,
});

const roster = [
  P("张三", null, true), // 主账号：名下挂着子账号 → 只汇总、不上桌
  P("李四", null, true),
  P("老陈", null, false), // 独立号：自己上桌
  P("三哥", "张三"),
  P("小张", "张三"),
  P("小王", "李四"),
];

group("[1] 挂着子账号的主账号不上桌");
check("主账号标记仍然保留", isMainAccount(roster[0]), true);
check("独立号不算主账号", isMainAccount(roster[2]), false);
check("子账号不算主账号", isMainAccount(roster[3]), false);
check(
  "选人列表剔除挂着子账号的主账号，其余账号全在",
  selectableNames(roster),
  ["老陈", "三哥", "小张", "小王"]
);
check("张三（有子账号）上不了桌", canSit(roster, "张三"), false);
check("独立号可以上桌", canSit(roster, "老陈"), true);
check("子账号可以上桌", canSit(roster, "三哥"), true);
check(
  "名册外的新昵称一律放行（下拉框 allow-create 现敲的名字）",
  canSit(roster, "新来的"),
  true
);
check("空名字不算能上桌", canSit(roster, ""), false);
check("传 undefined 名册不炸", canSit(undefined, "老陈"), true);

group("[2] 名下没子账号的主账号等同独立号，可以上桌");
const emptyMain = [P("张三", null, true), P("老陈", null, false)];
check("只建了主账号和独立号时", selectableNames(emptyMain), ["张三", "老陈"]);
check("空壳主账号可以上桌", canSit(emptyMain, "张三"), true);
check(
  "一挂上子账号，张三立刻退出选人列表",
  selectableNames([...emptyMain, P("三哥", "张三")]),
  ["老陈", "三哥"]
);

group("[3] 今日榜按上桌的号排名");
const today = [
  { ...P("三哥", "张三"), score: 5, raceResult: { win: 1, lose: 0, deuce: 0 } },
  { ...P("小王", "李四"), score: -5, raceResult: { win: 0, lose: 1, deuce: 0 } },
];
check(
  "子账号各自成行，不归集到主账号",
  buildTodayRanking(today, roster).map((row) => `${row.name}:${row.score}`),
  ["三哥:5", "小王:-5"]
);
check(
  "今日榜不含任何主账号行",
  buildTodayRanking(today, roster).some((row) => row.name === "张三"),
  false
);
check(
  "按积分降序",
  buildTodayRanking(
    [
      { ...P("小王", "李四"), score: -5 },
      { ...P("三哥", "张三"), score: 8 },
      { ...P("老陈", null, false), score: 3 },
    ],
    roster
  ).map((row) => row.name),
  ["三哥", "老陈", "小王"]
);

group("[4] 主账号脏数据不会混进今日榜");
const dirty = [
  { ...P("张三", null, true), score: 0 },
  { ...P("三哥", "张三"), score: 2, raceResult: { win: 1, lose: 0, deuce: 0 } },
];
check(
  "无战绩的主账号被剔除",
  buildTodayRanking(dirty, roster).map((row) => row.name),
  ["三哥"]
);

group("[5] 总榜仍然按主账号汇总");
const allAfter = applyOutcome(roster, [
  { name: "三哥", delta: 5, result: "win" },
  { name: "小王", delta: -5, result: "lose" },
]);
check(
  "主账号汇总名下子账号",
  buildMainRanking(allAfter)
    .filter((row) => ["张三", "李四", "老陈"].includes(row.name))
    .map((row) => `${row.name}:${row.score}`),
  ["张三:5", "老陈:0", "李四:-5"]
);

group("[6] 同一主账号下的两个子账号在今日榜各算各的");
const twoSubs = applyOutcome(
  [P("三哥", "张三"), P("小张", "张三")],
  [
    { name: "三哥", delta: 5, result: "win" },
    { name: "小张", delta: -5, result: "lose" },
  ]
);
check(
  "两行分别计分，互不抵消",
  buildTodayRanking(twoSubs, roster).map((row) => `${row.name}:${row.score}`),
  ["三哥:5", "小张:-5"]
);

// 历史遗留场景：主账号在「名下还没有子账号」那段时间自己打过，
// 后来才挂上子账号 —— 它自己那份战绩仍然要算，且不能和子账号重复累加
group("[7] 主账号自己名下也有战绩时，总榜不翻倍");
const mainPlays = applyOutcome(
  [P("张三", null, true), P("三哥", "张三"), P("老陈", null, false)],
  [
    { name: "张三", delta: 5, result: "win" },
    { name: "老陈", delta: -5, result: "lose" },
  ]
);
check(
  "主账号自己赢的 5 分只算一次（不是 10）",
  buildMainRanking(mainPlays)
    .filter((row) => row.name === "张三")
    .map((row) => row.score),
  [5]
);
const todayWithMain = applyOutcome(
  [P("张三", null, true), P("老陈", null, false)],
  [
    { name: "张三", delta: 5, result: "win" },
    { name: "老陈", delta: -5, result: "lose" },
  ]
);
check(
  "今日榜里主账号自己成一行",
  buildTodayRanking(todayWithMain, roster).map(
    (row) => `${row.name}:${row.score}`
  ),
  ["张三:5", "老陈:-5"]
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
