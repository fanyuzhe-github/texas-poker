const fs = require("fs");
const path = require("path");

const BASE =
  "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon";

async function grab(url, tries = 4, ext = "png") {
  for (let i = 0; i < tries; i += 1) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      // 按扩展名做一次"看起来对不对"的校验，避免把 404 页面当图存下来
      if (ext === "svg") {
        const head = buf.toString("utf8", 0, 3000);
        if (!head.includes("<svg")) throw new Error("not svg");
      } else if (buf[0] !== 0x89 || buf[1] !== 0x50) {
        throw new Error("not png");
      }
      return buf;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

async function run(ids, outDir, suffix, ext = "png") {
  fs.mkdirSync(outDir, { recursive: true });
  const failed = [];
  const sizes = [];
  let done = 0;
  const queue = ids.slice();

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const file = path.join(outDir, id + "." + ext);
      if (fs.existsSync(file) && fs.statSync(file).size > 100) {
        done += 1;
        sizes.push(fs.statSync(file).size);
        continue;
      }
      const url = suffix
        ? `${BASE}/${suffix}/${id}.${ext}`
        : `${BASE}/${id}.${ext}`;
      try {
        const buf = await grab(url, 4, ext);
        fs.writeFileSync(file, buf);
        sizes.push(buf.length);
        done += 1;
        process.stdout.write(`\r${done}/${ids.length} `);
      } catch (e) {
        failed.push(id);
        done += 1;
      }
    }
  }

  await Promise.all([worker(), worker(), worker()]);
  console.log(
    `\n完成 ${ids.length - failed.length}/${ids.length}, 总字节 ${sizes.reduce(
      (a, b) => a + b,
      0
    )}, 失败: ${failed.join(",") || "无"}`
  );
  return failed;
}

module.exports = { run, grab };

if (require.main === module) {
  const ids = process.argv[2].split(",").map(Number);
  const dir = process.argv[3];
  const suffix = process.argv[4] || "";
  run(ids, dir, suffix);
}
