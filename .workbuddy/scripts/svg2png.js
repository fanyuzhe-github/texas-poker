/**
 * 一次性脚本：把 dream-world 的 SVG 矢量插画光栅化成 PNG。
 *
 * 为什么不直接上 SVG：Chromium 在 `file://` 下**禁止** `<img>` 加载本地 SVG
 * （实测 png 能加载、svg 不行，naturalWidth 恒为 0），而本项目的 dist 是靠
 * `publicPath: "./"` 双击打开用的。光栅化成 PNG 后离线双击照样有图。
 *
 * 用法：
 *   node svg2png.js <svg目录> <输出目录> [边长]
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = process.argv[2] || "/tmp/pkart-svg";
const OUT = process.argv[3] || "/tmp/pkart-png";
const SIZE = Number(process.argv[4]) || 256;
/** SVG 渲染 DPI：dream-world 的 width 只有 135~300px，不提 dpi 就会被按原尺寸渲染再放大变糊 */
const DENSITY = 300;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
  let total = 0;

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const out = path.join(OUT, file.replace(/\.svg$/, ".png"));
    await sharp(path.join(SRC, file), { density: DENSITY })
      .resize(SIZE, SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out);
    total += fs.statSync(out).size;
    process.stdout.write(`\r${i + 1}/${files.length} `);
  }

  console.log(
    `\n输出 ${files.length} 张 ${SIZE}px PNG，合计 ${(total / 1024).toFixed(1)} KB`
  );
})();
