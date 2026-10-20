/**
 * gist.js 单测 —— 重点是 findGistId。
 *
 * 它是「换台电脑能拿到数据」的关键：新设备只记得 token，不记得 gistId，
 * 全靠这个函数按文件名把云端存档认领回来。
 */
import { findGistId, isFineGrainedToken } from "../src/utils/gist.js";

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`✓ ${name}`);
  } else {
    fail += 1;
    console.log(`✗ ${name}${extra ? "  → " + extra : ""}`);
  }
}

const realFetch = globalThis.fetch;
let lastUrl = "";
let lastInit = null;
let stub = null;

function stubFetch(impl) {
  globalThis.fetch = async (url, init) => {
    lastUrl = String(url);
    lastInit = init || null;
    return impl(url, init);
  };
}

function jsonRes(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/** 造一个 gist 列表项 */
function gistItem(id, filename, updatedAt) {
  return {
    id,
    updated_at: updatedAt,
    files: filename ? { [filename]: { content: "{}" } } : {},
  };
}

/* ---------------------------------------------------------- */
/* findGistId：认领逻辑                                        */
/* ---------------------------------------------------------- */

// 1. 唯一一份匹配 → 返回它的 id
stubFetch(async () =>
  jsonRes([gistItem("aaa111", "texas-poker-backup.json", "2026-10-01T00:00:00Z")])
);
check("一份匹配时返回其 id", (await findGistId("t")) === "aaa111");

// 2. 请求要带 per_page=100，否则默认只回 30 条，存档多了会漏
check("请求带 per_page=100", lastUrl.includes("per_page=100"), lastUrl);

// 3. 请求要带 token（不带就是匿名读，看不到 secret gist）
check(
  "请求带 Authorization",
  !!(lastInit && lastInit.headers && lastInit.headers.Authorization === "Bearer t")
);

// 4. 混着别的 gist → 只认我们那个文件名
stubFetch(async () =>
  jsonRes([
    gistItem("other1", "notes.md", "2026-10-05T00:00:00Z"),
    gistItem("mine99", "texas-poker-backup.json", "2026-10-01T00:00:00Z"),
    gistItem("other2", "hello.py", "2026-10-06T00:00:00Z"),
  ])
);
check("只认备份文件名，忽略其他 gist", (await findGistId("t")) === "mine99");

// 5. 多份备份 → 取最近更新的那份（内容最新）
stub = [
  gistItem("old", "texas-poker-backup.json", "2026-09-01T00:00:00Z"),
  gistItem("newest", "texas-poker-backup.json", "2026-10-09T00:00:00Z"),
  gistItem("mid", "texas-poker-backup.json", "2026-10-02T00:00:00Z"),
];
stubFetch(async () => jsonRes(stub));
check("多份时取最近更新的那份", (await findGistId("t")) === "newest");

// 6. 一份都没有 → 空串（调用方据此提示「先去有数据的那台备份」）
stubFetch(async () => jsonRes([gistItem("x", "notes.md", "2026-10-01T00:00:00Z")]));
check("没有备份时返回空串", (await findGistId("t")) === "");

// 7. 空列表
stubFetch(async () => jsonRes([]));
check("空列表返回空串", (await findGistId("t")) === "");

// 8. 返回不是数组（接口异常）不炸
stubFetch(async () => jsonRes({ message: "Bad credentials" }, 401));
let msg = "";
try {
  await findGistId("t");
} catch (error) {
  msg = error && error.message ? error.message : "";
}
check("401 转中文提示", msg.includes("token"), msg);

// 9. gist 缺 files 字段不炸
stubFetch(async () => jsonRes([{ id: "nofiles", updated_at: "2026-10-01T00:00:00Z" }]));
check("gist 缺 files 不炸且返回空串", (await findGistId("t")) === "");

// 10. 网络层抛错要往外传，不能吞成空串（否则会误判「没有存档」去新建）
stubFetch(async () => {
  throw new TypeError("Failed to fetch");
});
msg = "";
try {
  await findGistId("t");
} catch (error) {
  msg = error && error.message ? error.message : "";
}
check("网络错误要抛出来（不能当作没有存档）", msg.includes("连不上"), msg);

globalThis.fetch = realFetch;

/* ---------------------------------------------------------- */
/* isFineGrainedToken：细粒度 token 没有 Gist 权限，要提前拦下  */
/* ---------------------------------------------------------- */

// 11. 细粒度 token 认得出来
check("github_pat_ 认作细粒度", isFineGrainedToken("github_pat_11ABCDEFG0xxxxxxxxxxxxx") === true);

// 12. classic token 不能误判
check("ghp_ 不算细粒度", isFineGrainedToken("ghp_abcdefghijklmnopqrstuvwxyz0123456789") === false);

// 13. 老式 40 位十六进制 token 也不能误判
check("老式 token 不算细粒度", isFineGrainedToken("0123456789abcdef0123456789abcdef01234567") === false);

// 14. 空值 / 前后空格都不炸
check("空值返回 false", isFineGrainedToken("") === false && isFineGrainedToken(null) === false);
check("前后空格照样认", isFineGrainedToken("  github_pat_xxx  ") === true);

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
