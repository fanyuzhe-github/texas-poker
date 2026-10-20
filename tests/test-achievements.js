/**
 * 成就勋章单测。运行前先把 src/core 同步过来（见同目录其它测试）。
 */
import assert from "node:assert";
import {
  buildAchievements,
  buildMedalWall,
  groupAchievements,
  achievementProgress,
  tierClass,
  TIER_LABEL,
} from "../src/core/achievements.js";

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

/** 造一局：results 形如 [["甲","win",30]]，第三项是结算后剩余筹码 */
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

const solo = [{ name: "甲", parent: null }, { name: "乙", parent: null }];

const duo = [
  { name: "主", parent: null, isMain: true },
  { name: "子A", parent: "主" },
  { name: "乙", parent: null },
];

const ach = (list, key) => list.find((item) => item.key === key);
/** 取某枚勋章某人的解锁记录 */
const own = (list, key, name) =>
  (ach(list, key).owners || []).find((row) => row.name === name);

console.log("成就勋章（28 枚：荣誉 15 + 连胜 8 + 黑章 5）");

/* ---------------- 基本形状 ---------------- */

check("buildAchievements 固定返回 28 条，展示信息齐全", () => {
  const list = buildAchievements([], []);
  assert.strictEqual(list.length, 28);
  list.forEach((item) => {
    assert.ok(item.key && item.title && item.icon, `${item.key} 缺展示信息`);
    assert.ok(["bronze", "silver", "gold"].includes(item.tier), item.tier);
    assert.ok(["glory", "streak", "dark"].includes(item.kind), item.kind);
  });
});

check("分区：15 枚荣誉 + 8 枚连胜 + 5 枚黑章", () => {
  const groups = groupAchievements(buildAchievements([], []));
  assert.deepStrictEqual(groups.map((g) => g.key), ["glory", "streak", "dark"]);
  assert.strictEqual(groups[0].items.length, 15);
  assert.strictEqual(groups[1].items.length, 8);
  assert.strictEqual(groups[2].items.length, 5);
});

check("连胜章 3~10 各一枚，称号按序且独立成组", () => {
  const list = buildAchievements([], []);
  const want = [
    ["streak3", "三阳开泰"],
    ["streak4", "四通八达"],
    ["streak5", "五路财神"],
    ["streak6", "六六大顺"],
    ["streak7", "七星高照"],
    ["streak8", "八仙过海"],
    ["streak9", "九九归一"],
    ["streak10", "十全十美"],
  ];
  want.forEach(([key, title], index) => {
    const item = ach(list, key);
    assert.strictEqual(item.title, title, `${key} 称号不对`);
    assert.strictEqual(item.kind, "streak", `${key} 应属连胜组`);
    // 3~5 铜 / 6~8 银 / 9~10 金
    const tier = index < 3 ? "bronze" : index < 6 ? "silver" : "gold";
    assert.strictEqual(item.tier, tier, `${key} 段位不对`);
    assert.ok(item.hint.includes(`连续 ${index + 3} 场`), `${key} 门槛文案不对`);
  });
  // 荣誉组里不该再有连胜章
  const glory = groupAchievements(list).find((g) => g.key === "glory");
  assert.ok(!glory.items.some((i) => /^streak\d+$/.test(i.key)), "荣誉组还残留连胜章");
});

check("tierClass / TIER_LABEL 三档", () => {
  assert.strictEqual(tierClass("gold"), "tier tier--gold");
  assert.strictEqual(tierClass("silver"), "tier tier--silver");
  assert.strictEqual(tierClass("bronze"), "tier tier--bronze");
  assert.strictEqual(tierClass("未知"), "tier tier--bronze");
  assert.strictEqual(TIER_LABEL.gold, "金");
});

check("空历史 / 脏数据：全部未解锁且不炸", () => {
  [[], undefined].forEach((history) => {
    [undefined, []].forEach((players) => {
      const list = buildAchievements(history, players);
      assert.strictEqual(list.length, 28);
      list.forEach((item) => {
        assert.strictEqual(item.unlocked, false, item.key);
        assert.strictEqual(item.first, null);
        assert.deepStrictEqual(item.owners, []);
      });
      assert.deepStrictEqual(buildMedalWall(list), []);
      const progress = achievementProgress(list, []);
      assert.strictEqual(progress.total, 28);
      assert.strictEqual(progress.unlocked, 0);
      assert.strictEqual(progress.percent, 0);
      assert.strictEqual(progress.players, 0);
    });
  });
});

/* ---------------- 同一枚勋章只记第一次 ---------------- */

check("同一人多次达标只解锁一次，取最早那一局", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 30]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 25]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 40]]),
  ];
  const list = buildAchievements(rounds, solo);
  const row = own(list, "round1x", "甲");
  assert.strictEqual(row.round, 1, "应停在第一次达标");
  assert.strictEqual(ach(list, "round1x").owners.length, 1);
});

check("全局「首杀」是全场最早达成的那一位，不是赢得最多的", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["乙", "win", 30]]), // 乙 第一局就达标
    game(ts(2026, 5, 1, 20), [["甲", "win", 12]]), // 甲 第三局才够 1 倍底注
    game(ts(2026, 5, 1, 21), [["甲", "win", 40]]),
  ];
  const item = ach(buildAchievements(rounds, solo), "round1x");
  assert.strictEqual(item.first.name, "乙");
  assert.strictEqual(item.first.round, 1);
  assert.strictEqual(item.owners.length, 2);
  assert.strictEqual(item.owners[1].name, "甲");
});

/* ---------------- 阈值按底注倍数，不写死金额 ---------------- */

check("底注改成 100 后，同样的金额不再误发/post-x", () => {
  const rounds = [game(ts(2026, 5, 1, 19), [["甲", "win", 250]], 100)]; // +150
  const list = buildAchievements(rounds, solo);
  assert.ok(own(list, "round1x", "甲"), "≥ 1 倍底注（100）应解锁");
  assert.ok(!own(list, "round2x", "甲"), "≥ 2 倍底注（200）不该解锁");
  assert.ok(ach(list, "round1x").hint.includes("100.00"), ach(list, "round1x").hint);
});

check("同一局金额在小底注下能连跳多级", () => {
  const rounds = [game(ts(2026, 5, 1, 19), [["甲", "win", 45]], 10)]; // +35
  const list = buildAchievements(rounds, solo);
  assert.ok(own(list, "round1x", "甲"));
  assert.ok(own(list, "round2x", "甲"));
  assert.ok(own(list, "round3x", "甲"));
});

/* ---------------- 主子账号归集 ---------------- */

check("子账号的战绩归到主账号名下，子账号自己不单独上榜", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["子A", "win", 30], ["乙", "lose", 0]]),
  ];
  const list = buildAchievements(rounds, duo);
  const item = ach(list, "round1x");
  assert.strictEqual(item.first.name, "主");
  assert.ok(!item.owners.some((row) => row.name === "子A"), "子账号不应单列");
});

check("同一主账号（两个号）在同一局只算一份", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["子A", "win", 20], ["主", "win", 20], ["乙", "lose", 0]]),
  ];
  const item = ach(buildAchievements(rounds, duo), "round2x");
  assert.strictEqual(item.owners.filter((row) => row.name === "主").length, 1);
});

/* ---------------- 连胜口径 ---------------- */

check("连胜：平局不打断也不计数", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 15]]),
    game(ts(2026, 5, 1, 20), [["甲", "deuce", 10]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 15]]),
    game(ts(2026, 5, 2, 19), [["甲", "win", 15]]),
  ];
  const row = own(buildAchievements(rounds, solo), "streak3", "甲");
  assert.ok(row, "平局不该打断连胜");
  assert.strictEqual(row.round, 4, "第三场胜是在第 4 局");
});

check("连胜：被一场败仗打断后重新计数", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 15]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 15]]),
    game(ts(2026, 5, 1, 21), [["甲", "lose", 0]]),
    game(ts(2026, 5, 2, 19), [["甲", "win", 15]]),
    game(ts(2026, 5, 2, 20), [["甲", "win", 15]]),
  ];
  const list = buildAchievements(rounds, solo);
  assert.strictEqual(own(list, "streak3", "甲"), undefined, "断了就不该有 3 连胜");
  assert.strictEqual(own(list, "streak5", "甲"), undefined);
});

/* ---------------- 翻盘 / 半壁江山 ---------------- */

check("翻盘：输光的下一局赢回来才算", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 30]]),
  ];
  const row = own(buildAchievements(rounds, solo), "comeback", "甲");
  assert.strictEqual(row.round, 2);
  assert.ok(row.detail.includes("第 1 局输光"), row.detail);
});

check("翻盘：输光后下一局继续输的不算", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5]]),
  ];
  assert.strictEqual(ach(buildAchievements(rounds, solo), "comeback").unlocked, false);
});

check("半壁江山：现场过半才算，差一点不给", () => {
  const three = [
    { name: "甲", parent: null },
    { name: "乙", parent: null },
    { name: "丙", parent: null },
  ];
  // 3 人桌每局桌上共 30（30 的一半是 15）
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 14], ["乙", "win", 12], ["丙", "lose", 4]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 20], ["乙", "lose", 5], ["丙", "lose", 5]]),
  ];
  const row = own(buildAchievements(rounds, three), "halfTable", "甲");
  assert.strictEqual(row.round, 2, "第 1 局 14 < 15，第 2 局才够");
  assert.strictEqual(row.value, 20);
});

/* ---------------- 黑勋章 ---------------- */

check("输光次数：第 5 次那一局解锁，没输过光的人不出现", () => {
  const rounds = [];
  for (let i = 0; i < 6; i += 1) {
    rounds.push(
      game(ts(2026, 5, 1 + i, 19), [["甲", "lose", 0], ["乙", "win", 20]])
    );
  }
  const list = buildAchievements(rounds, solo);
  assert.strictEqual(own(list, "busted5", "甲").round, 5);
  assert.strictEqual(own(list, "busted5", "乙"), undefined, "乙从没输光，不该进黑榜");
  assert.strictEqual(ach(list, "busted10").unlocked, false, "才 6 次，不该解锁 10 次");
});

check("输光判定：底注为 0 的脏数据不会把全场判成输光", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "deuce", 0], ["乙", "deuce", 0]], 0),
  ];
  const list = buildAchievements(rounds, solo);
  assert.strictEqual(own(list, "busted5", "甲"), undefined);
  assert.strictEqual(ach(list, "busted5").unlocked, false);
  assert.strictEqual(ach(list, "round1x").unlocked, false);
});

check("黑勋章只发给真的打输过的人", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
  ];
  const list = buildAchievements(rounds, solo);
  const dark = groupAchievements(list).find((g) => g.key === "dark").items;
  dark.forEach((item) => {
    const names = (item.owners || []).map((row) => row.name);
    assert.ok(!names.includes("甲"), `${item.key} 不该发给从没输过的甲`);
  });
});

check("慈善家：生涯累计亏损到门槛才解锁，只赢过的人不进榜", () => {
  const rounds = [];
  for (let i = 0; i < 11; i += 1) {
    rounds.push(game(ts(2026, 5, 1 + i, 19), [["甲", "lose", 0], ["乙", "win", 30]]));
  }
  const list = buildAchievements(rounds, solo);
  const row = own(list, "philanthropist", "甲");
  assert.strictEqual(row.round, 10, "第 10 局才累计亏到 100");
  assert.strictEqual(own(list, "philanthropist", "乙"), undefined, "乙一直在赢");
});

check("连败大师：连续 5 场没赢过才解锁，赢家不进榜", () => {
  const rounds = [];
  for (let i = 0; i < 5; i += 1) {
    rounds.push(
      game(ts(2026, 5, 1 + i, 19), [["甲", "lose", 0], ["乙", "win", 20]])
    );
  }
  const list = buildAchievements(rounds, solo);
  assert.strictEqual(own(list, "lose5", "甲").round, 5);
  assert.strictEqual(own(list, "lose5", "乙"), undefined);
});

check("一日散财：同一天累计亏到门槛才解锁（不是看单局）", () => {
  // 单局最多只能亏一个底注，必须靠一天多局累计才能到 5 倍
  const rounds = [];
  for (let i = 0; i < 6; i += 1) {
    rounds.push(
      game(ts(2026, 5, 1, 19 + i), [["甲", "lose", 0], ["乙", "win", 20]])
    );
  }
  const list = buildAchievements(rounds, solo);
  const row = own(list, "dayNeg5x", "甲");
  assert.strictEqual(row.round, 5, "第 5 局累计亏到 50");
  assert.strictEqual(row.value, -50);
  assert.strictEqual(own(list, "dayNeg5x", "乙"), undefined);
});

check("一日暴富：跨天要重新累计，正如腔门口径一致", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 40], ["乙", "lose", 0]]), // +30
    game(ts(2026, 5, 1, 20), [["甲", "win", 40], ["乙", "lose", 0]]), // +30 → 当天 60 ≥ 50
    game(ts(2026, 5, 2, 19), [["甲", "win", 40], ["乙", "lose", 0]]), // 换一天，单独只有 30
  ];
  const row = own(buildAchievements(rounds, solo), "day5x", "甲");
  assert.strictEqual(row.round, 2);
  assert.strictEqual(row.value, 60);
});

/* ---------------- 门槛类：样本不够不上榜 ---------------- */

check("神射手：不足 20 局不给，达标后取第一次到达的那一局", () => {
  const rounds = [];
  for (let i = 0; i < 25; i += 1) {
    rounds.push(game(ts(2026, 5, 1, 19 + i), [["甲", "win", 20], ["乙", "lose", 0]]));
  }
  const list = buildAchievements(rounds, solo);
  const row = own(list, "sharpshooter", "甲");
  assert.strictEqual(row.round, 20, "第 20 局刚好达标");
  assert.strictEqual(row.text, "100.0%");
});

const NOW = ts(2026, 7, 15, 12); // 2026 春（3~5 月）已收官，用它固定口径

check("赛季冠军：至少 3 局，只来一局登顶不算", () => {
  const rounds = [
    game(ts(2026, 3, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]]),
  ];
  assert.strictEqual(
    ach(buildAchievements(rounds, solo, { now: NOW }), "champion").unlocked,
    false
  );

  const enough = [
    ...rounds,
    game(ts(2026, 3, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 3, 1, 21), [["甲", "win", 20], ["乙", "lose", 0]]),
  ];
  const item = ach(buildAchievements(enough, solo, { now: NOW }), "champion");
  assert.strictEqual(item.first.name, "甲");
  assert.ok(item.first.detail.includes("春"), item.first.detail);
  assert.ok(!item.first.detail.includes("年年"), "赛季 label 自带年份，别重复前缀");
  // 甲春三局 +20 +10 +10 = +40 元
  assert.strictEqual(item.first.value, 40);
  assert.strictEqual(item.first.text, "+40.00");
});

check("赛季冠军：赛季还在进行中就先不发（避免中途领先者先拿章）", () => {
  const rounds = [
    game(ts(2026, 4, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]]),
    game(ts(2026, 4, 1, 20), [["甲", "win", 20], ["乙", "lose", 0]]),
    game(ts(2026, 4, 1, 21), [["甲", "win", 20], ["乙", "lose", 0]]),
  ];
  // 赛季进行中（2026-04-20 仍在春赛季内）
  const running = buildAchievements(rounds, solo, { now: ts(2026, 4, 20, 12) });
  assert.strictEqual(
    ach(running, "champion").unlocked,
    false,
    "赛季没收官就不该有冠军"
  );
  // 收官后（2026-06-02 已越过 6 月 1 日）
  const closed = buildAchievements(rounds, solo, { now: ts(2026, 6, 2, 12) });
  const item = ach(closed, "champion");
  assert.strictEqual(item.unlocked, true, "赛季收官后才颁奖");
  assert.strictEqual(item.first.name, "甲");
  assert.ok(item.first.detail.includes("收官"), item.first.detail);
  // 解锁时刻 = 收官点（6 月 1 日零点），落在“上一局之后、本局之内”的窗口里
  assert.strictEqual(item.first.time, ts(2026, 6, 1, 0) - 1);
});

/* ---------------- 新增 5 枚荣誉勋章 ---------------- */

check("一网打尽：同桌其他人都输钱才给", () => {
  const all = [game(ts(2026, 5, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]], 10)];
  const first = ach(buildAchievements(all, solo), "sweep");
  assert.ok(first.first.detail.includes("全场独赢"), first.first.detail);
  const got = ach(buildAchievements(all, solo), "sweep");
  assert.strictEqual(got.unlocked, true);
  assert.strictEqual(got.first.name, "甲");

  // 新口径：别人只是小亏、没被打光，也算「一网打尽」
  const smallLoss = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 25], ["乙", "lose", 5]], 10),
  ];
  assert.strictEqual(
    ach(buildAchievements(smallLoss, solo), "sweep").unlocked,
    true,
    "乙亏了 5 块（没输光），按新口径照样算"
  );
});

check("一网打尽：同桌还有人没亏，就不给", () => {
  // 乙没亏（打平），丙亏 —— 甲不能算通吃
  const rounds = [
    game(
      ts(2026, 5, 1, 19),
      [["甲", "win", 20], ["乙", "deuce", 10], ["丙", "lose", 0]],
      10
    ),
  ];
  assert.strictEqual(ach(buildAchievements(rounds, solo), "sweep").unlocked, false);

  // 还有一个人也赢了 → 也不是独赢
  const twoWinners = [
    game(
      ts(2026, 5, 1, 19),
      [["甲", "win", 20], ["乙", "win", 10], ["丙", "lose", 0]],
      10
    ),
  ];
  assert.strictEqual(ach(buildAchievements(twoWinners, solo), "sweep").unlocked, false);
});

check("一网打尽：按主账号汇总盈亏，一赢一亏不算输家", () => {
  // 子A 亏 10、子B 赚 10 → 主账号「主」整体不亏，甲不算通吃全场
  const rounds = [
    game(
      ts(2026, 5, 1, 19),
      [["甲", "win", 20], ["子A", "lose", 0], ["子B", "win", 20]],
      10
    ),
  ];
  const list = buildAchievements(rounds, [
    { name: "主", parent: null, isMain: true },
    { name: "子A", parent: "主" },
    { name: "子B", parent: "主" },
    { name: "甲", parent: null },
  ]);
  assert.strictEqual(
    ach(list, "sweep").unlocked,
    false,
    "主账号合起来没亏，甲没有独赢"
  );
});

check("一网打尽：一个人自己摆一桌不算（至少两人同桌）", () => {
  const alone = [game(ts(2026, 5, 1, 19), [["甲", "win", 10]], 10)];
  assert.strictEqual(ach(buildAchievements(alone, solo), "sweep").unlocked, false);
});

check("一网打尽：同一主账号的两个子账号同桌，不算把对手清空", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["子A", "win", 15], ["子B", "win", 15], ["乙", "lose", 0]], 10),
  ];
  const list = buildAchievements(rounds, [
    { name: "主", parent: null, isMain: true },
    { name: "子A", parent: "主" },
    { name: "子B", parent: "主" },
    { name: "乙", parent: null },
  ]);
  // 乙确实清零了，主账号「主」的对手全空 → 解锁
  assert.strictEqual(ach(list, "sweep").unlocked, true);
  assert.strictEqual(ach(list, "sweep").first.name, "主");
});

check("一网打尽：同主账号一个号赢、一个号输光，不算通收（别发「全场 0.00」）", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["子A", "lose", 0], ["子B", "win", 30], ["乙", "lose", 0]], 10),
  ];
  const list = buildAchievements(rounds, [
    { name: "主", parent: null, isMain: true },
    { name: "子A", parent: "主" },
    { name: "子B", parent: "主" },
    { name: "乙", parent: null },
  ]);
  assert.strictEqual(ach(list, "sweep").unlocked, false);
});

check("零封之夜：同一天 3 局全胜才给，只赢 2 局不给", () => {
  const two = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 15], ["乙", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 15], ["乙", "lose", 5]]),
  ];
  assert.strictEqual(ach(buildAchievements(two, solo), "perfectDay").unlocked, false);

  const three = [...two, game(ts(2026, 5, 1, 21), [["甲", "win", 15], ["乙", "lose", 5]])];
  const got = ach(buildAchievements(three, solo), "perfectDay");
  assert.strictEqual(got.unlocked, true);
  assert.strictEqual(got.first.name, "甲");
  assert.strictEqual(got.first.round, 3, "解锁点记在当天最后一局");
});

check("零封之夜：同一天 3 局里有平局就不算全胜", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 15], ["乙", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "deuce", 10], ["乙", "deuce", 10]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 15], ["乙", "lose", 5]]),
  ];
  assert.strictEqual(ach(buildAchievements(rounds, solo), "perfectDay").unlocked, false);
});

check("零封之夜：跨天赢的场次不合并统计", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 15], ["乙", "lose", 5]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 15], ["乙", "lose", 5]]),
    game(ts(2026, 5, 2, 20), [["甲", "win", 15], ["乙", "lose", 5]]),
  ];
  assert.strictEqual(ach(buildAchievements(rounds, solo), "perfectDay").unlocked, false);
});

check("常胜将军：连续 3 个比赛日都净赚才给", () => {
  const mk = (d, chips) => game(ts(2026, 5, d, 19), [["甲", "win", chips], ["乙", "lose", 20 - chips]]);
  const ok = [mk(1, 15), mk(2, 18), mk(3, 12)];
  const got = ach(buildAchievements(ok, solo), "profitDays");
  assert.strictEqual(got.unlocked, true);
  assert.strictEqual(got.first.round, 3);
  assert.strictEqual(got.first.text, "3 天连赚");

  // 中间亏一天 → 断
  const broken = [mk(1, 15), game(ts(2026, 5, 2, 19), [["甲", "lose", 5], ["乙", "win", 15]]), mk(3, 12), mk(4, 12), mk(5, 12)];
  const b = ach(buildAchievements(broken, solo), "profitDays");
  assert.strictEqual(b.unlocked, true, "第 3~5 天重新连上 3 天");
  assert.strictEqual(b.first.round, 5, "解锁点不能落在断掉之前");
});

check("常胜将军：一天里一赢一亏合计为正，这天仍算盈利日", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 18], ["乙", "lose", 2]]),
    game(ts(2026, 5, 1, 20), [["甲", "lose", 5], ["乙", "win", 15]]),
    game(ts(2026, 5, 2, 19), [["甲", "win", 15], ["乙", "lose", 5]]),
    game(ts(2026, 5, 3, 19), [["甲", "win", 15], ["乙", "lose", 5]]),
  ];
  assert.strictEqual(ach(buildAchievements(rounds, solo), "profitDays").unlocked, true);
});

check("盆满钵满：生涯累计净赚 20 倍底注才给，只赢一次不给", () => {
  const one = [game(ts(2026, 5, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]], 10)];
  assert.strictEqual(ach(buildAchievements(one, solo), "lifetime20x").unlocked, false);

  const rounds = [];
  for (let i = 1; i <= 21; i += 1) {
    rounds.push(game(ts(2026, 5, i, 19), [["甲", "win", 20], ["乙", "lose", 0]], 10));
  }
  const got = ach(buildAchievements(rounds, solo), "lifetime20x");
  assert.strictEqual(got.unlocked, true);
  assert.strictEqual(got.first.round, 20, "第 20 局刚好跨过 20 倍底注");
  assert.strictEqual(got.first.value, 200);
});

check("盆满钵满：底注改成 100 后门槛跟着涨（不写死 200）", () => {
  const rounds = [];
  for (let i = 1; i <= 21; i += 1) {
    rounds.push(game(ts(2026, 5, i, 19), [["甲", "win", 110], ["乙", "lose", 90]], 100));
  }
  const got = ach(buildAchievements(rounds, solo), "lifetime20x");
  assert.strictEqual(got.unlocked, false, "每局只赚 10 元，20 倍底注（2000）远没到");
});

check("牌桌老炮：累计出场满 50 局才给", () => {
  const rounds = [];
  for (let i = 1; i <= 50; i += 1) {
    const day = Math.floor((i - 1) / 3) + 1;
    rounds.push(game(ts(2026, 5, day, 19 + ((i - 1) % 3)), [["甲", "deuce", 10], ["乙", "deuce", 10]]));
  }
  const got = ach(buildAchievements(rounds.slice(0, 49), solo), "veteran50");
  assert.strictEqual(got.unlocked, false);
  const full = ach(buildAchievements(rounds, solo), "veteran50");
  assert.strictEqual(full.unlocked, true);
  assert.strictEqual(full.first.round, 50);
  assert.strictEqual(full.tier, "bronze");
});

check("新增 5 枚全部归在荣誉组，不属于连胜 / 黑章", () => {
  const list = buildAchievements([], solo);
  ["sweep", "perfectDay", "profitDays", "lifetime20x", "veteran50"].forEach((key) => {
    assert.strictEqual(ach(list, key).kind, "glory", `${key} 应是荣誉章`);
    assert.ok(ach(list, key).hint, `${key} 要有达成条件文案`);
    assert.ok(ach(list, key).icon.startsWith("el-icon-"), `${key} 要有图标`);
  });
  // 图标不能和既有 23 枚撞（连胜 8 枚本就一人一个图标，同理新章也要各不相同）
  const fresh = ["sweep", "perfectDay", "profitDays", "lifetime20x", "veteran50"];
  const oldIcons = new Set(
    list.filter((item) => fresh.indexOf(item.key) < 0).map((item) => item.icon)
  );
  fresh.forEach((key) => {
    const icon = ach(list, key).icon;
    assert.ok(!oldIcons.has(icon), `${key} 的图标 ${icon} 和老勋章撞了`);
  });
  assert.strictEqual(
    new Set(fresh.map((key) => ach(list, key).icon)).size,
    fresh.length,
    "5 枚新章之间图标也不能重复"
  );
});

/* ---------------- 聚合：个人墙与进度 ---------------- */

check("个人墙：按人聚合，数量与逐枚统计一致", () => {
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 20), [["甲", "win", 30], ["乙", "lose", 0]]),
    game(ts(2026, 5, 1, 21), [["甲", "win", 30], ["乙", "lose", 0]]),
    game(ts(2026, 5, 2, 19), [["甲", "win", 30], ["乙", "lose", 0]]),
    game(ts(2026, 5, 3, 19), [["甲", "win", 30], ["乙", "lose", 0]]),
  ];
  const list = buildAchievements(rounds, solo);
  const wall = buildMedalWall(list);
  const totalOf = wall.reduce((sum, row) => sum + row.count, 0);
  const granted = list.reduce((sum, item) => sum + item.owners.length, 0);
  assert.strictEqual(totalOf, granted);
  assert.strictEqual(wall[0].name, "甲", "甲拿的章更多");
  wall.forEach((row) => {
    assert.strictEqual(row.count, row.glory + row.streak + row.dark);
    const roundsSeen = row.medals.map((m) => m.round);
    assert.deepStrictEqual(roundsSeen.slice().sort((a, b) => a - b), roundsSeen, "勋章按达成先后排");
  });

  const progress = achievementProgress(list, wall);
  assert.strictEqual(progress.total, 28);
  assert.ok(progress.unlocked > 0 && progress.unlocked <= 28);
  assert.strictEqual(progress.percent, Math.round((progress.unlocked / 28) * 100));
  assert.strictEqual(progress.players, wall.length);
});

/* ---------------- 金额精度 ---------------- */

check("金额无浮点误差（0.1 + 0.2 + 0.3 累计到当日门槛）", () => {
  // 底注 0.1 元时「一日暴富」的门槛是 0.5 元，正好能把浮点噪声逼出来
  const rounds = [
    game(ts(2026, 5, 1, 19), [["甲", "win", 0.2]], 0.1), // +0.10
    game(ts(2026, 5, 1, 20), [["甲", "win", 0.3]], 0.1), // +0.20
    game(ts(2026, 5, 1, 21), [["甲", "win", 0.4]], 0.1), // +0.30
  ];
  const row = own(buildAchievements(rounds, solo), "day5x", "甲");
  assert.strictEqual(row.round, 3);
  assert.strictEqual(row.value, 0.6); // 不能是 0.6000000000000001
  assert.strictEqual(row.text, "+0.60");
});

check("value 对外一律是「元」，不是「分」", () => {
  const rounds = [game(ts(2026, 5, 1, 19), [["甲", "win", 30], ["乙", "lose", 0]])];
  const row = own(buildAchievements(rounds, solo), "round1x", "甲");
  assert.strictEqual(row.value, 20);
  assert.ok(Math.abs(row.value) < 1000, `${row.value} 看着像分`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
