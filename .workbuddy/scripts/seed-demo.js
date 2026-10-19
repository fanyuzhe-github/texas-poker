/**
 * 演示数据脚本 —— 在浏览器控制台 / agent-browser eval 里整段粘贴执行。
 *
 * 用途：本地没有流水时，快速造出一桌「有历史、有勋章、有段位差异」的牌局，
 * 用来核对 UI（对齐、配色、溢出）。每天重跑都清空重写，不污染正式数据。
 *
 * 用法：
 *   cd <项目根>
 *   agent-browser eval "$(cat .workbuddy/scripts/seed-demo.js)"
 *
 * 想改人数 / 局数就调下面的 CONFIG，rand 是固定种子的伪随机，结果可复现。
 */
(() => {
  const CONFIG = {
    names: [
      "三哥",
      "老陈",
      "闹闹",
      "洋洋",
      "小聪明",
      "风沙狂舞",
      "沙河彭于晏",
    ],
    rounds: 22, // 局数越多，勋章与纪录越丰富
    baseChips: 10,
    seed: 20261017,
  };

  let s = CONFIG.seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  const players = CONFIG.names.map((n, i) => ({
    seatNum: i + 1,
    name: n,
    score: 0,
    buyIn: CONFIG.baseChips,
    chips: CONFIG.baseChips,
    parent: null,
    isMain: false,
    avatar: "",
  }));

  const history = [];
  const now = Date.now();
  for (let r = 0; r < CONFIG.rounds; r += 1) {
    const t = now - (CONFIG.rounds - r) * 3600 * 1000 * 3;
    // 赢家带一点"手感"：连续几局同一个人容易拿，才能凑出连胜章
    const winner = CONFIG.names[Math.floor(rnd() * CONFIG.names.length)];
    const records = CONFIG.names.map((name, i) => {
      const seatNum = i + 1;
      if (name === winner) {
        const chips = Math.round((20 + rnd() * 25) * 100) / 100;
        return { name, seatNum, chips, delta: chips - CONFIG.baseChips, result: "win" };
      }
      const left = rnd() < 0.35 ? 0 : Math.round(rnd() * 8 * 100) / 100;
      return {
        name,
        seatNum,
        chips: left,
        delta: left - CONFIG.baseChips,
        result: left - CONFIG.baseChips < 0 ? "lose" : "deuce",
      };
    });
    history.push({
      id: "demo_" + r,
      time: t,
      baseChips: CONFIG.baseChips,
      records,
      transfers: [],
    });
  }

  localStorage.setItem("allPlayers", JSON.stringify(players));
  localStorage.setItem("poker:history", JSON.stringify(history));
  return `已写入 ${players.length} 位玩家 / ${history.length} 局流水，刷新页面即可`;
})();
