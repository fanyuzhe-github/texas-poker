import { mainOf, limitOnePerMain, selectableNames } from "../src/core/ranking.js";

let pass = 0;
let fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label} → 期望 ${b}，实际 ${a}`);
  }
}

const players = [
  { name: "张三", parent: null, score: 0 },
  { name: "三哥", parent: "张三", score: 0 },
  { name: "小张", parent: "张三", score: 0 },
  { name: "老陈", parent: null, score: 0 },
];

console.log("\n[1] mainOf 归属");
eq(mainOf(players, "三哥"), "张三", "子账号 → 主账号");
eq(mainOf(players, "张三"), "张三", "主账号 → 自己");
eq(mainOf(players, "路人"), "路人", "查无此人 → 自己");
eq(mainOf([], "三哥"), "三哥", "空库 → 自己");

console.log("\n[2] 同组只留最新选择");
eq(
  limitOnePerMain(players, ["三哥", "小张"]),
  ["小张"],
  "先选三哥再选小张，保留小张"
);
eq(
  limitOnePerMain(players, ["小张", "三哥"]),
  ["三哥"],
  "反过来保留三哥"
);
eq(
  limitOnePerMain(players, ["老陈", "三哥", "小张", "李四"]),
  ["老陈", "小张", "李四"],
  "多人混选只剔除同组，新昵称放行"
);
eq(
  limitOnePerMain(players, ["三哥", "老陈", "小张"]),
  ["老陈", "小张"],
  "剔除后其余顺序不变"
);

console.log("\n[3] 边界");
eq(limitOnePerMain(players, []), [], "空选择");
eq(limitOnePerMain(players, null), [], "null 输入");
eq(limitOnePerMain(null, ["三哥"]), ["三哥"], "空玩家库不影响");
eq(limitOnePerMain(players, ["三哥", "三哥"]), ["三哥"], "同名只留一个");
eq(
  limitOnePerMain(players, ["张三", "三哥"]),
  ["三哥"],
  "主账号与自己的子账号也算同一组"
);

console.log("\n[4] 挂着子账号的主账号不上桌（只做汇总）");
eq(
  selectableNames(players),
  ["三哥", "小张", "老陈"],
  "剔掉张三（名下有三哥、小张），其余都能上桌"
);
eq(
  selectableNames([
    { name: "老王", parent: null, score: 0 },
    { name: "老陈", parent: null, score: 0 },
  ]),
  ["老王", "老陈"],
  "名下没有子账号的顶层账号都能上桌"
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
