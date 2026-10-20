/**
 * 记录榜（六项历史之最）单测。
 * 运行前先同步核心文件：见 README（cp + perl 补 .js 后缀）
 */
import assert from "node:assert";
import {
  buildRecords,
  buildRecordWall,
  groupRecords,
  rankClass,
  RATE_MIN_GAMES,
} from "../src/core/records.js";

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✗ ${label}`);
    console.log(`      ${error.message}`);
  }
}

const ts = (y, m, d, hh = 20) => new Date(y, m - 1, d, hh, 0, 0).getTime();

/** 造一局：results 形如 [["闹闹","win",30], ...]，第三项是结算后剩余筹码 */
function game(time, results, baseChips = 10) {
  return {
    time,
    baseChips,
    records: results.map(([name, result, chips]) => ({
      name,
      result,
      delta: chips - baseChips,
      chips,
    })),
  };
}

const players = [
  { name: "老陈", parent: null, isMain: true },
  { name: "陈小号", parent: "老陈" },
  { name: "闹闹", parent: null },
  { name: "风沙狂舞", parent: null },
  { name: "洋洋", parent: null },
];

// 2026-03-01 三局（春） + 2026-07-01 两局（夏） + 洋洋单局（测胜率门槛）
const history = [
  game(ts(2026, 3, 1, 19), [["闹闹", "win", 30], ["陈小号", "win", 15], ["风沙狂舞", "lose", 0]]),
  game(ts(2026, 3, 1, 20), [["闹闹", "win", 18], ["陈小号", "win", 15], ["风沙狂舞", "lose", 0]]),
  game(ts(2026, 3, 1, 21), [["闹闹", "win", 13], ["陈小号", "win", 12], ["风沙狂舞", "lose", 0]]),
  game(ts(2026, 7, 1, 19), [["闹闹", "lose", 0], ["陈小号", "win", 25], ["风沙狂舞", "win", 16]]),
  game(ts(2026, 7, 1, 20), [["闹闹", "lose", 0], ["陈小号", "win", 20], ["风沙狂舞", "win", 12]]),
  game(ts(2026, 7, 1, 21), [["洋洋", "win", 20]]),
];

const rec = (records, key) => records.find((item) => item.key === key);

/** 只有甲、乙两个独立号的小样本 */
const solo = [{ name: "甲", parent: null }, { name: "乙", parent: null }];

/** 甲、乙、丙三个独立号（垫底王要 3 人同桌才有意义） */
const trio = [
  { name: "甲", parent: null },
  { name: "乙", parent: null },
  { name: "丙", parent: null },
];

console.log("记录榜（十五项历史之最）");

check("buildRecords 固定返回 15 条，key 齐全", () => {
  const records = buildRecords(history, players);
  assert.strictEqual(records.length, 15);
  assert.deepStrictEqual(records.map((r) => r.key), [
    "bestRound",
    "biggestLead",
    "bestSeason",
    "longestStreak",
    "bestRunMoney",
    "bestRate",
    "mostBusted",
    "longestLose",
    "lastPlace",
    "coldShower",
    "peakDrop",
    "longNight",
    "bestComeback",
    "comebackTimes",
    "streakBreaker",
  ]);
  records.forEach((record) => {
    assert.ok(record.title && record.icon && record.hint, `${record.key} 缺展示信息`);
  });
});

/* ---------------- 1. 单局最高积分 ---------------- */

check("单局最高积分：取全局单局最大 delta", () => {
  const row = rec(buildRecords(history, players), "bestRound").leader;
  assert.strictEqual(row.name, "闹闹");
  assert.strictEqual(row.value, 20);
  assert.strictEqual(row.text, "+20.00");
  assert.ok(row.detail.indexOf("第 1 局") === 0, row.detail);
});

check("单局最高积分：子账号归到主账号，主账号自己不重复计", () => {
  const rows = rec(buildRecords(history, players), "bestRound").board;
  const chen = rows.find((r) => r.name === "老陈");
  assert.strictEqual(chen.value, 15); // 陈小号 g4 的 +15
  assert.ok(!rows.some((r) => r.name === "陈小号"), "子账号不应单列");
});

/* ---------------- 2. 碾压王 ---------------- */

check("碾压王：取单局领先第二名最多的那次", () => {
  const row = rec(buildRecords(history, players), "biggestLead").leader;
  assert.strictEqual(row.name, "闹闹");
  assert.strictEqual(row.value, 15); // 第 1 局 +20，次席老陈 +5
  assert.strictEqual(row.text, "+15.00");
  assert.strictEqual(row.detail, "第 1 局 · 全场 +20.00 / 次席 +5.00");
});

check("碾压王：老陈是夏季那局（+15 领先 +6）", () => {
  const rows = rec(buildRecords(history, players), "biggestLead").board;
  const chen = rows.find((r) => r.name === "老陈");
  assert.strictEqual(chen.value, 9);
  assert.strictEqual(chen.detail, "第 4 局 · 全场 +15.00 / 次席 +6.00");
});

check("碾压王：一人摆一桌不算（洋洋单局无人可比）", () => {
  const rows = rec(buildRecords(history, players), "biggestLead").board;
  assert.ok(!rows.some((r) => r.name === "洋洋"), "一个人上桌没有第二名");
});

check("碾压王：并列双赢刷不出纪录（差距为 0）", () => {
  const tie = [game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "win", 20]])];
  assert.strictEqual(rec(buildRecords(tie, solo), "biggestLead").leader, null);
});

check("碾压王：全场都在输钱时也不发（本人得真赢到钱）", () => {
  const allLose = [game(ts(2026, 5, 1, 19), [["甲", "lose", 5], ["乙", "lose", 0]])];
  assert.strictEqual(rec(buildRecords(allLose, solo), "biggestLead").leader, null);
});

/* ---------------- 3. 赛季最高积分 ---------------- */

check("赛季最高积分：跨赛季取个人最好的那一季", () => {
  const row = rec(buildRecords(history, players), "bestSeason").leader;
  assert.strictEqual(row.name, "闹闹");
  assert.strictEqual(row.value, 31); // 春 31，夏 -20
  assert.ok(row.detail.indexOf("春") > 0, row.detail);
});

check("赛季最高积分：另一人的最好赛季可以是夏季", () => {
  const rows = rec(buildRecords(history, players), "bestSeason").board;
  const chen = rows.find((r) => r.name === "老陈");
  assert.strictEqual(chen.value, 25); // 春 12 / 夏 25
  assert.ok(chen.detail.indexOf("夏") > 0, chen.detail);
});

/* ---------------- 4. 最高连胜 ---------------- */

check("最高连胜：取最长的一段，并带上那段赚的钱", () => {
  const row = rec(buildRecords(history, players), "longestStreak").leader;
  assert.strictEqual(row.name, "老陈"); // 陈小号 5 局全胜
  assert.strictEqual(row.value, 5);
  assert.strictEqual(row.text, "5连胜");
  assert.ok(row.detail.indexOf("第 1-5 局") === 0, row.detail);
});

check("最高连胜：闹闹是 3 连胜（后面 2 连败不影响 longestWin）", () => {
  const rows = rec(buildRecords(history, players), "longestStreak").board;
  const nao = rows.find((r) => r.name === "闹闹");
  assert.strictEqual(nao.value, 3);
});

/* ---------------- 5. 最猛一波 ---------------- */

check("最猛一波：取连胜里赚得最多的那一段（不是场数最长）", () => {
  const row = rec(buildRecords(history, players), "bestRunMoney").leader;
  assert.strictEqual(row.name, "老陈"); // 5 连胜共 +37
  assert.strictEqual(row.value, 37);
  assert.strictEqual(row.text, "+37.00");
  assert.strictEqual(row.detail, "5连胜 · 第 1-5 局");
});

check("最猛一波：闹闹是开局那波 3 连胜（+31）", () => {
  const rows = rec(buildRecords(history, players), "bestRunMoney").board;
  const nao = rows.find((r) => r.name === "闹闹");
  assert.strictEqual(nao.value, 31);
  assert.strictEqual(nao.detail, "3连胜 · 第 1-3 局");
});

check("最猛一波：断过的连胜分段取，不跨段累加", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 30]]), // +20
    game(ts(2026, 5, 1, 20), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 15]]), // +5
    game(ts(2026, 5, 1, 22), [["甲", "win", 12]]), // +2，这段共 +7
  ];
  const row = rec(buildRecords(rounds, solo), "bestRunMoney").leader;
  assert.strictEqual(row.value, 20);
  assert.strictEqual(row.detail, "1连胜 · 第 1-1 局");
});

check("最猛一波：一分没赚到的连胜不上高光榜", () => {
  // 平分彩池：判胜但 delta = 0
  const rounds = [game(ts(2026, 5, 1, 19), [["甲", "win", 10], ["乙", "win", 10]])];
  assert.strictEqual(rec(buildRecords(rounds, solo), "bestRunMoney").leader, null);
});

/* ---------------- 6. 最高胜率 ---------------- */

check("最高胜率：平局计入分母，取最高者", () => {
  const row = rec(buildRecords(history, players), "bestRate").leader;
  assert.strictEqual(row.name, "老陈");
  assert.strictEqual(row.text, "100.0%");
  assert.ok(row.detail.indexOf("5 局") === 0, row.detail);
});

check(`最高胜率：不足 ${RATE_MIN_GAMES} 局的不上榜（1 局 1 胜不算 100%）`, () => {
  const rows = rec(buildRecords(history, players), "bestRate").board;
  assert.ok(!rows.some((r) => r.name === "洋洋"), "洋洋只有 1 局，不该上榜");
});

check("最高胜率：所有人都没达标时该条为空态", () => {
  const tiny = [game(ts(2026, 3, 1, 19), [["闹闹", "win", 30], ["洋洋", "lose", 0]])];
  const record = rec(buildRecords(tiny, players), "bestRate");
  assert.strictEqual(record.leader, null);
  assert.strictEqual(record.board.length, 0);
});

/* ---------------- 6. 最多输光次数 ---------------- */

check("最多输光次数：筹码清零且当局亏损", () => {
  const row = rec(buildRecords(history, players), "mostBusted").leader;
  assert.strictEqual(row.name, "风沙狂舞");
  assert.strictEqual(row.value, 3);
  assert.strictEqual(row.text, "3 次");
  assert.ok(row.detail.indexOf("共 5 局") === 0, row.detail);
  assert.ok(row.detail.indexOf("60%") > 0, row.detail);
});

check("最多输光次数：闹闹 2 次排第二", () => {
  const rows = rec(buildRecords(history, players), "mostBusted").board;
  assert.strictEqual(rows[1].name, "闹闹");
  assert.strictEqual(rows[1].value, 2);
});

check("最多输光次数：没输过光的人不进榜（而不是 0 次占位）", () => {
  const rows = rec(buildRecords(history, players), "mostBusted").board;
  assert.ok(!rows.some((r) => r.name === "老陈"), "老陈从不输光，不该出现");
  assert.ok(!rows.some((r) => r.name === "洋洋"));
});

check("最多输光次数：底注为 0 的脏数据不会误判全员输光", () => {
  const dirty = [
    game(ts(2026, 3, 1, 19), [["闹闹", "deuce", 0], ["洋洋", "deuce", 0]], 0),
  ];
  const record = rec(buildRecords(dirty, players), "mostBusted");
  assert.strictEqual(record.leader, null);
});

/* ---------------- 聚合与边界 ---------------- */

check("荣誉墙：按人聚合，各人项数之和等于有保持者的记录数", () => {
  const records = buildRecords(history, players);
  const wall = buildRecordWall(records);
  // 15 项里「高台跳水」在这份流水下没人上榜（没人赢到过钱又吐回去）
  const withLeader = records.filter((item) => item.leader).length;
  const total = wall.reduce((sum, item) => sum + item.count, 0);
  assert.strictEqual(total, withLeader);
  const byName = new Map(wall.map((item) => [item.name, item.count]));
  // 风沙狂舞：最长连败 + 最多输光 + 垫底王 + 长夜漫漫 + 翻盘王 + 不死小强 + 连败终结者
  assert.strictEqual(byName.get("风沙狂舞"), 7);
  // 闹闹：单局/赛季最高 + 碾压王 + 当头一棒
  assert.strictEqual(byName.get("闹闹"), 4);
  // 老陈：最高连胜 + 最高胜率 + 最猛一波
  assert.strictEqual(byName.get("老陈"), 3);
  assert.strictEqual(wall[0].count, 7);
  assert.strictEqual(wall[0].titles.length, 7);
});

check("铁人出勤已下线：出勤王 / 连续出勤天数 / 元老三项不再存在", () => {
  const records = buildRecords(history, players);
  const keys = records.map((r) => r.key);
  ["mostGames", "longestAttendance", "veteran"].forEach((key) => {
    assert.ok(keys.indexOf(key) < 0, `${key} 不该再出现`);
  });
  assert.ok(!records.some((r) => r.group === "attend"), "attend 分组应已移除");
});

check("空历史：15 条记录都在但保持者为空", () => {
  const records = buildRecords([], players);
  assert.strictEqual(records.length, 15);
  records.forEach((record) => {
    assert.strictEqual(record.leader, null, `${record.key} 不该有保持者`);
    assert.deepStrictEqual(record.board, []);
  });
  assert.deepStrictEqual(buildRecordWall(records), []);
});

check("脏数据容忍：history / players 传 undefined 不炸", () => {
  const records = buildRecords(undefined, undefined);
  assert.strictEqual(records.length, 15);
  records.forEach((record) => assert.strictEqual(record.leader, null));
});

check("金额无浮点误差（0.1 + 0.2 - 0.3）", () => {
  const tricky = [
    game(ts(2026, 3, 1, 19), [["闹闹", "win", 10.1], ["风沙狂舞", "lose", 9.9]]),
    game(ts(2026, 3, 1, 20), [["闹闹", "win", 10.2], ["风沙狂舞", "lose", 9.8]]),
    game(ts(2026, 3, 1, 21), [["闹闹", "lose", 9.7], ["风沙狂舞", "win", 10.3]]),
  ];
  const row = rec(buildRecords(tricky, players), "peakDrop").leader;
  assert.strictEqual(row.name, "闹闹");
  // 盘中 +0.3，收盘 0.00，落差 0.3；不能是 0.30000000000000004
  assert.strictEqual(row.value, -0.3);
  assert.strictEqual(row.text, "-0.30");
  assert.strictEqual(row.detail, "03-01 · 盘中 +0.30 → 收盘 0.00");
});

check("board 最多 5 名挑战者", () => {
  const many = [];
  for (let i = 0; i < 12; i += 1) {
    many.push({ name: `P${i}`, parent: null });
  }
  const rounds = [];
  for (let g = 0; g < 6; g += 1) {
    rounds.push(
      game(
        ts(2026, 3, 1 + g, 19),
        many.map((p, i) => [p.name, "win", 10 + i])
      )
    );
  }
  const record = rec(buildRecords(rounds, many), "bestRate");
  assert.ok(record.board.length <= 5, `实际 ${record.board.length}`);
});

check("rankClass 前三名金银铜", () => {
  assert.strictEqual(rankClass(0), "rank rank--gold");
  assert.strictEqual(rankClass(1), "rank rank--silver");
  assert.strictEqual(rankClass(2), "rank rank--bronze");
  assert.strictEqual(rankClass(3), "rank");
});

/* ---------------- 至暗时刻：四条各有各的画面 ---------------- */

check("垫底王：数的是全场垫底的次数，并给出垫底率", () => {
  const row = rec(buildRecords(history, players), "lastPlace").leader;
  // 风沙狂舞前 3 局都是全场最差，闹闹后 2 局垫底
  assert.strictEqual(row.name, "风沙狂舞");
  assert.strictEqual(row.value, 3);
  assert.strictEqual(row.text, "3 次");
  assert.strictEqual(row.detail, "共 5 局 · 垫底率 60%");
});

check("垫底王：闹闹靠后两局排第二", () => {
  const rows = rec(buildRecords(history, players), "lastPlace").board;
  assert.strictEqual(rows[1].name, "闹闹");
  assert.strictEqual(rows[1].value, 2);
});

check("垫底王：两人桌不算（输家必然垫底，那是概率不是倒霉）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0], ["乙", "win", 20]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5], ["乙", "win", 15]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "lastPlace").leader, null);
});

check("垫底王：并列垫底不算（分不出「最惨的那个」）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 5], ["乙", "lose", 5], ["丙", "win", 20]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, trio), "lastPlace").leader, null);
});

check("当头一棒：连胜被终结的那一局，取输得最狠的一次", () => {
  const row = rec(buildRecords(history, players), "coldShower").leader;
  assert.strictEqual(row.name, "闹闹"); // 3 连胜之后第 4 局输光
  assert.strictEqual(row.value, -10);
  assert.strictEqual(row.text, "-10.00");
  assert.strictEqual(row.detail, "3连胜后 · 第 4 局");
});

check("当头一棒：只赢一局就输回来不算（连胜 1 场是正常波动）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 0], ["乙", "win", 20]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "coldShower").leader, null);
});

check("当头一棒：从没连胜过的人不进榜", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 10], ["乙", "win", 10]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 22), [["甲", "lose", 10], ["乙", "win", 10]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "coldShower").leader, null);
});

check("高台跳水：一天之内盘中最高 → 收盘的落差", () => {
  // 甲：+10 +10 0 -10 → 盘中 +20，收盘 +10，落差 10
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 21), [["甲", "deuce", 10], ["乙", "deuce", 10]]),
    game(ts(2026, 5, 1, 22), [["甲", "lose", 0], ["乙", "win", 20]]),
  ];
  const row = rec(buildRecords(rounds, solo), "peakDrop").leader;
  assert.strictEqual(row.name, "甲");
  assert.strictEqual(row.value, -10);
  assert.strictEqual(row.text, "-10.00");
  assert.strictEqual(row.detail, "05-01 · 盘中 +20.00 → 收盘 +10.00");
});

check("高台跳水：全天都在亏的不算（得先赢到过钱）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 5], ["乙", "win", 15]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 0], ["乙", "win", 20]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "peakDrop").leader, null);
});

check("高台跳水：一路上涨收盘创新高的不算跳水", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "peakDrop").leader, null);
});

check("长夜漫漫：输光后熬过最多局才翻身的这一次", () => {
  const row = rec(buildRecords(history, players), "longNight").leader;
  // 风沙狂舞第 1 局输光，熬过 2、3 两局，第 4 局才翻身
  assert.strictEqual(row.name, "风沙狂舞");
  assert.strictEqual(row.value, 2);
  assert.strictEqual(row.text, "2 局");
  assert.strictEqual(row.detail, "第 1 局输光 · 第 4 局翻身");
});

check("长夜漫漫：下一局就赢回来的不算（那是翻盘王，不惨）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0], ["乙", "win", 20]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "longNight").leader, null);
});

check("长夜漫漫：至今没翻身的不记（故事还没结束）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0], ["乙", "win", 20]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5], ["乙", "win", 15]]),
    game(ts(2026, 5, 1, 21), [["甲", "lose", 3], ["乙", "win", 17]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "longNight").leader, null);
});

check("已下线的三项不再出现：单局最惨 / 当日最惨 / 最惨连败", () => {
  const keys = buildRecords(history, players).map((r) => r.key);
  ["worstRound", "worstDay", "worstStreak"].forEach((key) => {
    assert.ok(keys.indexOf(key) < 0, `${key} 不该再出现`);
  });
});

/* ---------------- 补过程：戏剧性与韧性 ---------------- */

check("翻盘王：输光后「下一局」赢回最多的一次", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 30]]),
    game(ts(2026, 5, 2, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 2, 20), [["甲", "win", 12]]),
  ];
  const row = rec(buildRecords(rounds, solo), "bestComeback").leader;
  assert.strictEqual(row.value, 20);
  assert.strictEqual(row.detail, "第 1 局输光 · 第 2 局赢回");
});

check("翻盘王：输光后下一局继续输的不算翻盘", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "bestComeback").leader, null);
});

check("翻盘王：只认紧接的下一局，不是「输光后赢最多」", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 11]]), // 紧接的下一局只 +1
    game(ts(2026, 5, 1, 21), [["甲", "win", 40]]), // 第三局 +30，但不算翻盘
  ];
  const row = rec(buildRecords(rounds, solo), "bestComeback").leader;
  assert.strictEqual(row.value, 1);
  assert.strictEqual(row.detail, "第 1 局输光 · 第 2 局赢回");
});

check("最长不输光已下线：不再有这条记录", () => {
  const keys = buildRecords(history, players).map((r) => r.key);
  assert.ok(keys.indexOf("longestSurvive") < 0, "开局人人并列，已删");
});

/* ---------------- 13. 不死小强 ---------------- */

check("不死小强：数的是爬起来的次数，不是金额", () => {
  const row = rec(buildRecords(history, players), "comebackTimes").leader;
  assert.strictEqual(row.name, "风沙狂舞");
  assert.strictEqual(row.value, 1);
  assert.strictEqual(row.text, "1 次");
  assert.strictEqual(row.detail, "输光 3 次 · 爬起来 33%");
});

check("不死小强：一次都没爬起来的不进榜（0 次不占位）", () => {
  const rows = rec(buildRecords(history, players), "comebackTimes").board;
  // 闹闹输光两局，后面一局没赢回来；老陈从没输光
  assert.ok(!rows.some((r) => r.name === "闹闹"), "闹闹没爬起来过");
  assert.ok(!rows.some((r) => r.name === "老陈"));
});

check("不死小强：爬两次就记两次", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 12]]),
    game(ts(2026, 5, 1, 21), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 22), [["甲", "win", 30]]),
  ];
  const row = rec(buildRecords(rounds, solo), "comebackTimes").leader;
  assert.strictEqual(row.value, 2);
  assert.strictEqual(row.detail, "输光 2 次 · 爬起来 100%");
});

/* ---------------- 14. 连败终结者 ---------------- */

check("连败终结者：连败之后那一局赢回最多的一次", () => {
  const row = rec(buildRecords(history, players), "streakBreaker").leader;
  assert.strictEqual(row.name, "风沙狂舞");
  assert.strictEqual(row.value, 6); // 3 连败后第 4 局 +6
  assert.strictEqual(row.text, "+6.00");
  assert.strictEqual(row.detail, "熬过 3 连败 · 第 4 局");
});

check("连败终结者：只输一局就赢回来不算（1 连败太容易）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 30]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "streakBreaker").leader, null);
});

check("连败终结者：平局不打断连败计数", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "deuce", 10]]),
    game(ts(2026, 5, 1, 21), [["甲", "lose", 5]]),
    game(ts(2026, 5, 1, 22), [["甲", "win", 15]]),
  ];
  const row = rec(buildRecords(rounds, solo), "streakBreaker").leader;
  assert.strictEqual(row.value, 5);
  assert.strictEqual(row.detail, "熬过 2 连败 · 第 4 局");
});

check("连败终结者：连败之后继续输的不算终结", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5]]),
    game(ts(2026, 5, 1, 21), [["甲", "lose", 5]]),
  ];
  assert.strictEqual(rec(buildRecords(rounds, solo), "streakBreaker").leader, null);
});

/* ---------------- 分组 ---------------- */

check("groupRecords：三组齐全且不漏项", () => {
  const groups = groupRecords(buildRecords(history, players));
  assert.deepStrictEqual(groups.map((g) => g.key), [
    "highlight",
    "dark",
    "grit",
  ]);
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  assert.strictEqual(total, 15);
  assert.strictEqual(groups[0].items.length, 6); // 高光时刻
  assert.strictEqual(groups[1].items.length, 6); // 至暗时刻
  assert.strictEqual(groups[2].items.length, 3); // 韧性时刻
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
