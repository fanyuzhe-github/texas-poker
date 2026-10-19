# 实时同步服务

给德州扑克结算做多设备实时同步的小后端，跑在 **Deno Deploy 免费层**，前端在设置页填地址和房间码即可连上。

它只做三件事：按房间码存一份快照、读出来、变化时推给订阅方。
后端不认识任何业务字段——快照就是 `src/core/sync.js` 里 `buildSnapshot` 的产物。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ping` | 健康检查，返回 `service: "texas-poker-sync"` |
| GET | `/api/state?room=xxx` | 读快照，云端没数据时 `snapshot` 为 null |
| POST | `/api/state?room=xxx` | 写快照。默认拒绝比云端更旧的写入（返回 409），带 `&force=1` 可强制覆盖 |
| GET | `/api/watch?room=xxx` | SSE，快照变化时推送 `state` 事件 |

房间码规则：`4~64` 位，只能用字母、数字、下划线、短横线。它既是这份数据的名字，也相当于口令——**别用 `poker` 这种能猜到的**。

## 部署（约 3 分钟，只需做一次）

1. 打开 <https://dash.deno.com>，**用 GitHub 登录**（免费层不用实名、不用绑卡）
2. 右上角 **New Project** → 选从 GitHub 部署 → 授权后选中 `texas-poker` 仓库
3. 入口文件填 `server/main.ts`，其余保持默认，点部署
4. 部署完成后会得到一个地址，形如 `https://your-project.deno.dev`
5. 回到应用：**设置 → 实时同步**，粘贴这个地址，填一个房间码（点「随机」按钮生成），点「连接并同步」

第二台设备重复第 5 步，**填同一个地址和同一个房间码**，打开页面就是最新数据。

> 仓库 push 到 master 时 Deno 会自动重新部署，和 GitHub Pages 那套流程互不影响。

## 本地试跑

```bash
deno run -A --unstable-kv server/main.ts
# 另开一个终端
curl "http://localhost:8000/api/ping"
curl "http://localhost:8000/api/state?room=test1234"
```

## 免费额度够不够

Deno Deploy 免费层：100 万请求/月、1 GiB KV 存储、100 万读 / 50 万写/月。
这份数据撑死几百 KB，一天同步几十次，**离额度差几个数量级**，不用担心。
关键在于它**不会因为闲置而休眠**——这也是选它而不是 Supabase 的原因。

## 隐私

房间码就是唯一的口令，拿到它就能读写那一份数据。数据存在 Deno 的 KV 里，
传输全程 HTTPS。战绩本身没什么敏感内容，如果介意就换一个足够随机的房间码。
