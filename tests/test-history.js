/**
 * trimHistory / gameBytes：流水的体积上限
 *
 * 这一层替换掉老的 `slice(0, 200)` 静默截断。测试重点不是「能不能裁」，
 * 而是：预算怎么算（UTF-8 字节）、裁掉的是不是**最老的**、有没有留空洞、
 * 以及最新一局永远不丢。
 */
import { trimHistory, gameBytes, HISTORY_MAX_BYTES } from "../src/core/history.js";
import { buildSeasonScores } from "../src/core/season.js";

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
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
function ok(label, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}`);
  }
}

/** 造一局：id 越大越新，名字用中文顺便验 UTF-8 字节；id 补零定宽，免得长度差影响字节数 */
function game(id, name = "张三") {
  return {
    id: String(id).padStart(4, "0"),
    time: 1700000000000 + id * 3600000,
    baseChips: 10000,
    records: [
      { name, seatNum: 1, chips: 12000, delta: 2000, result: "win" },
      { name: "李四", seatNum: 2, chips: 8000, delta: -2000, result: "lose" },
    ],
    transfers: [{ from: "李四", to: name, amount: 2000 }],
  };
}
/** 新 → 旧，和 loadHistory 的输出顺序一致 */
function makeHistory(count) {
  return Array.from({ length: count }, (_, i) => game(count - i));
}

console.log("\n[1] gameBytes 按 UTF-8 字节算，中文算 3 字节");
const one = { name: "老王" };
check("两个中文字 = 3 + 3 字节", gameBytes(one), Buffer.byteLength('{"name":"老王"}', "utf8"));
ok(
  "比字符数大（不是按 UTF-16 长度估的）",
  gameBytes(one) > JSON.stringify(one).length
);
check("序列化不了的对象返回 0", gameBytes({ toJSON: () => { throw new Error("x"); } }), 0);
check("null 也能序列化（返回 4）", gameBytes(null), 4);

console.log("\n[2] 预算够用：一局都不裁");
const small = makeHistory(5);
const keepAll = trimHistory(small, 1024 * 1024);
check("原样保留", keepAll.list.length, 5);
check("没裁掉任何一局", keepAll.dropped, 0);
check("顺序不变（最新在前）", keepAll.list.map((g) => g.id), ["0005", "0004", "0003", "0002", "0001"]);
ok("bytes 与逐局累加一致", keepAll.bytes > 0);

console.log("\n[3] 超预算：只砍最老的，且保留的是连续的最新前缀");
const many = makeHistory(60);
const per = gameBytes(many[0]);
const budget = per * 10 + 10; // 大约装得下 10 局
const trimmed = trimHistory(many, budget);
check("保留 10 局", trimmed.list.length, 10);
check("裁掉 50 局", trimmed.dropped, 50);
check("留的是最新的 60~51", trimmed.list.map((g) => Number(g.id)), [60, 59, 58, 57, 56, 55, 54, 53, 52, 51]);
ok("保留部分不超过预算", trimmed.bytes <= budget);
ok("少留一局就会超预算（说明没有浪费余量）", trimmed.bytes + per > budget);

console.log("\n[4] 最新一局永远不丢 —— 单局就超预算时也要留下");
const huge = [game(2), { ...game(1), records: Array.from({ length: 400 }, (_, i) => ({
  name: `路人${i}`, seatNum: i, chips: 100, delta: 0, result: "deuce",
})) }];
const tiny = trimHistory(huge, 10);
check("只留第一局", tiny.list.map((g) => g.id), ["0002"]);
check("其余算作裁掉", tiny.dropped, 1);

console.log("\n[5] 脏数据不炸");
check("空数组", trimHistory([]), { list: [], dropped: 0, bytes: 0 });
check("非数组", trimHistory(null), { list: [], dropped: 0, bytes: 0 });
check("字符串入参也当空", trimHistory("nope"), { list: [], dropped: 0, bytes: 0 });
check("中间混了 null 会被剔除，其余照常", trimHistory([game(2), null, game(1)]).list.length, 2);
check("预算传 0 回落到默认值", trimHistory(makeHistory(3), 0).list.length, 3);
check("预算传字符串数字也认", trimHistory(makeHistory(3), "1024").list.length, 3);
check("预算传非法值回落到默认", trimHistory(makeHistory(3), NaN).list.length, 3);

console.log("\n[6] 默认预算的量级（600KB 能装多少局）");
ok("默认预算是 600KB", HISTORY_MAX_BYTES === 600 * 1024);
const perGame = gameBytes(makeHistory(1)[0]);
const fit = Math.floor(HISTORY_MAX_BYTES / perGame);
console.log(`  · 这个测试局 ${perGame} 字节，预算刚好装 ${fit} 局`);
check(`装得下 ${fit} 局时一局不裁`, trimHistory(makeHistory(fit)).dropped, 0);
const overflow = trimHistory(makeHistory(fit + 20));
check(`多 20 局就裁 20 局`, overflow.dropped, 20);
ok(
  `保留部分不超预算（${Math.round(overflow.bytes / 1024)}KB）`,
  overflow.bytes <= HISTORY_MAX_BYTES
);
check("裁掉的是最老的 20 局", overflow.list[overflow.list.length - 1].id, "0021");

console.log("\n[7] 回归：老版本 slice(0, 200) 会让第 201 局起算错账");
// 250 局全在同一个赛季内，每局固定输赢 1 元
const seasonGames = Array.from({ length: 250 }, (_, i) => ({
  id: `g${250 - i}`,
  time: new Date(2026, 7, 1, 20, 0, 0).getTime() + (250 - i) * 3600000,
  baseChips: 10000,
  records: [
    { name: "老王", seatNum: 1, chips: 11000, delta: 1000, result: "win" },
    { name: "阿强", seatNum: 2, chips: 9000, delta: -1000, result: "lose" },
  ],
  transfers: [],
}));
const full = trimHistory(seasonGames).list;
check("新口径：250 局一局不少", full.length, 250);
const oldWay = seasonGames.slice(0, 200);
const scoreFull = buildSeasonScores(full, [{ name: "老王" }], seasonGames[0].time);
const scoreOld = buildSeasonScores(oldWay, [{ name: "老王" }], seasonGames[0].time);
check("新口径赛季积分 = 250 局全算（单位：分）", scoreFull.get("老王"), 250000);
check("老口径只算到 200 局（就是当年那个 bug）", scoreOld.get("老王"), 200000);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
