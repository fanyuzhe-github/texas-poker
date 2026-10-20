/**
 * 全量单测 runner：顺序跑 tests/ 下所有 test-*.js，汇总通过 / 失败。
 *
 * 为什么要自己写而不用 node --test：这些文件是历史积累的 assert 风格
 * （自己数 pass / fail 再打印摘要），改成 node:test 要动 20 个文件，不值当。
 * runner 只做「跑 + 收结果」，判定逻辑一律以进程退出码为准。
 *
 * 用法：npm test（等价于 node tests/run.js）
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir)
  .filter((name) => /^test-.*\.js$/.test(name))
  .sort();

/** Node 自己吐的噪音（警告、stack 行），不能当摘要 */
const NOISE = [
  /^\(node:/,
  /^\(Use `node/,
  /^Reparsing as ES module/,
  /^To eliminate this warning/,
  /^\(?:?ExperimentalWarning/,
  /^\s*at\s/,
];

/** 从输出里抓最后一行有效内容当摘要，比自己解析数字稳 */
function summaryOf(output) {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !NOISE.some((pattern) => pattern.test(line)));
  return lines.length ? lines[lines.length - 1] : "(没有输出)";
}

/**
 * 退出码为准；再扫一眼摘要里有没有非零的失败数 ——
 * 兜住那种「数了 fail 但忘了 process.exit(1)」的老文件。
 */
function looksFailed(output) {
  return /(?:失败|failed)[^\d]{0,4}[1-9]|[1-9]\d*\s*项?失败/i.test(output);
}

const failed = [];
const passed = [];

for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(dir, file)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const ok = result.status === 0 && !looksFailed(output);
  const summary = summaryOf(output);

  if (ok) {
    passed.push(file);
    console.log(`✓ ${file.padEnd(26)} ${summary}`);
  } else {
    failed.push(file);
    console.log(`✗ ${file.padEnd(26)} ${summary}`);
    // 失败时把完整输出打出来，否则只能看到一行摘要，没法定位
    console.log(
      output
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")
    );
  }
}

console.log(
  `\n${passed.length} 个文件通过，${failed.length} 个文件失败（共 ${files.length} 个）`
);

if (failed.length) {
  console.log(`失败清单：${failed.join(", ")}`);
  process.exit(1);
}
