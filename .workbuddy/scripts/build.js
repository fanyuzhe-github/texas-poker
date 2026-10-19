/**
 * 一次性脚本：把卡池 71 张的全国图鉴号 sprite 下载到 src/assets/cards/
 * 文件名用卡池自编号 001~071（与 cardPool.js 的 code 字段一致）。
 */
const fs = require("fs");
const path = require("path");
const { run } = require("./fetch.js");

// 与 cardPool.js 的分档顺序严格一一对应
const DEX = [
  // 1★ 基础形态 30
  ["绿毛虫", 10], ["独角虫", 13], ["波波", 16], ["小拉达", 19], ["穿山鼠", 27],
  ["超音蝠", 41], ["走路草", 43], ["喇叭芽", 69], ["呆呆兽", 79], ["瓦斯弹", 109],
  ["尼多兰", 29], ["六尾", 37], ["蚊香蝌蚪", 60], ["玛瑙水母", 72], ["大岩蛇", 95],
  ["小火马", 77], ["海星星", 120], ["卡拉卡拉", 104], ["猴怪", 56], ["卡蒂狗", 58],
  ["大钳蟹", 98], ["蛋蛋", 102], ["大舌头", 108], ["角金鱼", 118], ["鲤鱼王", 129],
  ["皮丘", 172], ["波克比", 175], ["橡实果", 273], ["长尾怪手", 190], ["小果然", 438],
  // 2★ 一阶进化 20
  ["皮卡丘", 25], ["火恐龙", 5], ["卡咪龟", 8], ["妙蛙草", 2], ["勇基拉", 64],
  ["哥达鸭", 55], ["穿山王", 28], ["霸王花", 45], ["飞天螳螂", 123], ["三合一磁怪", 82],
  ["呆河马", 80], ["嘎啦嘎啦", 105], ["引梦貘人", 96], ["毒刺水母", 73], ["大食花", 71],
  ["吉利蛋", 113], ["蚊香蛙", 61], ["白海狮", 87], ["猫老大", 53], ["派拉斯", 46],
  // 3★ 最终进化 12
  ["喷火龙", 6], ["水箭龟", 9], ["妙蛙花", 3], ["耿鬼", 94], ["风速狗", 59],
  ["暴鲤龙", 130], ["胡地", 65], ["卡比兽", 143], ["九尾", 38], ["沙奈朵", 282],
  ["雷丘", 26], ["比雕", 18],
  // 4★ 准传说 6
  ["快龙", 149], ["班基拉斯", 248], ["暴飞龙", 373], ["巨金怪", 376],
  ["路卡利欧", 448], ["烈焰猴", 392],
  // 5★ 传说 3
  ["超梦", 150], ["梦幻", 151], ["烈空坐", 386],
];

const OUT = process.argv[2] || "/tmp/pkart/cards";
const VARIANT = process.argv[3] || "";
/** 图片扩展名：png（96px sprite）或 svg（dream-world 官方插画） */
const EXT = process.argv[4] || "png";

(async () => {
  console.log(`共 ${DEX.length} 张，变体: ${VARIANT || "sprite(96px)"}，格式 ${EXT}`);
  fs.mkdirSync(OUT, { recursive: true });
  // 先落一份映射表，供后续核对
  fs.writeFileSync(
    path.join(OUT, "../dex-map.json"),
    JSON.stringify(Object.fromEntries(DEX), null, 2)
  );
  const ids = DEX.map(([, dex]) => dex);
  await run(ids, OUT, VARIANT, EXT);
  // 重命名成 001.xxx ~ 071.xxx
  DEX.forEach(([, dex], i) => {
    const code = String(i + 1).padStart(3, "0");
    const src = path.join(OUT, dex + "." + EXT);
    const dst = path.join(OUT, code + "." + EXT);
    if (fs.existsSync(src)) fs.renameSync(src, dst);
  });
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith("." + EXT));
  const total = files.reduce(
    (sum, f) => sum + fs.statSync(path.join(OUT, f)).size,
    0
  );
  console.log(`落盘 ${files.length} 张，合计 ${(total / 1024).toFixed(1)} KB`);
})();
