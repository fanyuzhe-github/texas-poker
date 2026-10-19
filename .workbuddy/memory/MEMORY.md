# 德州扑克结算工具 — 长期约定

## 技术栈
Vue 2.6 + Element UI 2.15 + vue-cli 4（勿升级）。build/dev 都要 `NODE_OPTIONS=--openssl-legacy-provider`；装包加 `--registry=https://registry.npmmirror.com`。dev server 随会话退出，打不开就 `npm run serve -- --port 8080`。

## 玩家体系
三种账号：子账号（`parent`）· 主账号（`isMain=true`）· 独立号，**都能上桌**（2026-10-18 改）。今日榜 `buildTodayRanking`（不归集）；总榜 `buildMainRanking`（主账号汇总）。
- `selectableNames` 返回全名册、不过滤主账号；「同主账号一局只出一个号」靠 `limitOnePerMain`（主账号与自己子号同组，后选顶掉先选）。
- ⚠️ 主账号亲自上桌**不翻倍**：战绩只记自己头上，`members=[main,...children]` 天然各算一次。
- ⚠️ `buildTodayRanking` 判断主账号是否上过桌要看**今日榜该行自己的 `raceResult`**（`totalGames>0`），不能看总库 `ref`（那份可能还是 0 场，会把真上桌的误剔）。
- ⚠️ 积分只记在实际下场的号头上，汇总一律实时算（两处都算会翻倍）。改名/解绑/换头像要同时写 `allPlayers` 与今日榜 `players`。
- ⚠️ **删局/清空流水必须走 `rebuildPlayersFromHistory`**（`core/ranking.js`，按 time 升序整体重放，只重建 5 个战绩字段）。`applyOutcome` 只能累加退不回——只改 `history` 不重建，总榜/段位/记录/勋章会按幽灵牌局算账。今日榜重建要加当天 `filter`。
- ⚠️ 选人列表不预置默认昵称（`DEFAULT_PLAYER_NAMES` 已删）；空名册靠 `el-select` 的 `slot="empty"` 提示「敲名字回车自动入库」（`allow-create`）。

## 头像
三档：自定义照片 → 卡牌头像 `card:c031` → 昵称色块（FNV-1a → 12 组渐变）。`core/avatar.js` 只做解析/解锁（core 不许 import 图片），卡图由 `utils/cardArt.js`（`require.context`）装配，`PlayerAvatar.vue` 是唯一渲染入口。
- 解锁**严格按拥有**（`isAvatarUnlocked` 只看 `owned[id]>0`，与星级无关；卡包挂主账号，子账号按 `player.parent` 取）。⚠️ 1★ 30 张「默认全开」兜底已取消 → 没卡就 0 个头像。未解锁的卡在选择器里**完全不渲染**（别复活灰圆 `?`）；唯一例外是当前正在用的（`legacy:true`，标「已不在卡包里」）。外环按星级 1灰/2蓝/3紫/4金/5彩虹。
- ⚠️ `.pav` 必须 `box-sizing:border-box`（靠 padding 描环）；卡图 `object-fit:contain` + 白底（cover 会切翅膀）。
- ⚠️ 24 只动物内置头像**已下线**（2026-10-18 换卡牌），`builtin:xxx` 在 `normalizeAvatar` 里被清空，别加回。
- ⚠️ 头像+名字+标签必须同一 flex 容器居中（`.cell-name`）。

## 段位
`core/tier.js` 12 档：`<-100` / `-100~100` 每 20 一档 / `>100`（含下不含上，只有 80~100 含 100）。称号从输到赢：人形ATM·慈善赌王·散财童子·资深韭菜·充值战神·萌新韭菜·小富即安·奶茶富翁·牌桌新贵·割韭狂魔·点石成金·赌神下凡（别拆「韭菜→镰刀」线）。吐槽走 `tierTip`。
- **只在「本局座位」显示**（RankTable 段位列已移除）。座位行是临时对象 → 段位回**当前赛季积分表**取 `tierScoreOf`（2026-10-19 改，原为总榜累计）。
- ⚠️ 赛季积分来自 `buildSeasonScores(history, players, now)` → `Map<主账号名, 赛季分>`：只筛本赛季流水 + `mainOf` 归集求和，**不重放连胜**。主账号自己上桌也归自己这组。
- ⚠️ **本赛季没上过桌的账号不在表里**：取不到按 0 分 → 显示「小富即安」，tooltip 补「本赛季还没上过桌」区分。
- 单测：`test-tier.js` 47 项 + `test-season-scores.js` 9 项。

## 座位表 · 筹码
加买已删（`buyIn` 恒等 `baseChips`）。筹码入口是弹窗（末列 `el-icon-coin`），取消 = 还原快照。换算走 money.js 整数分。

## 模块中心（全屏）
`ModuleStage.vue` 7 视图共用 Tab。`fixed;inset:0;z-index:3000`，append body，关闭先 `--closing` 淡出 220ms（**不用 `<transition>`**）。图表 `mounted` 初始化 / `beforeDestroy` dispose；切模块销毁重建，不做 keep-alive。Esc 走 document 冒泡。
- **选人禁 `el-select`**（popper 2015 会被 3000 压住）→ 头像卡横排。加模块要同时改 `MODULES` 和模板 `v-else-if`。

## 统计（口径全在 core 纯函数）
子账号用 `mainOf()` 归主账号；金额全程整数「分」；并列排序用 `compareName()` 码点（**禁 `localeCompare`**）。依赖单向：records → season → streak → stats。
- **看板**：涨红跌绿，资金曲线避开红绿；新图加进 `renderCharts()`。
- **streak**：取 `record.result`（不用 delta 推导）；平局不打断也不计次；`bestRun` ≠ `longestWin`。
- **season**：冬跨年；翻页 4 进制；积分从 history 重放。
- **记录榜** `records.js`：14 项三组（高光6/至暗5/韧性3）。⚠️ 已删「铁人出勤」「当日最高积分」「最长不输光」，韧性别再加「坏事没发生多久」类口径。胜率门槛 `RATE_MIN_GAMES=5`；输光=`chips<=0&&delta<0`；翻盘王=输光后下一局真赢回。四项新纪录：碾压王·最猛一波·不死小强（爬起来**次数**）·连败终结者（连败≥2 后赢最多）。
- **勋章** `achievements.js`：28 枚 = 荣誉15+连胜8+黑章5。⚠️「首胜」已删；⚠️ 座位表不展示勋章；⚠️ 赛季冠军必须等 `isSeasonClosed`，解锁时刻 = `seasonEndAt()`。
- ⚠️ **抽卡经济已定稿不要再动**（2026-10-18 拍板）：单抽 3 / 十连 21 券。**用户明确接受「第一天吃撑、后面变慢」**，别再以「发券太快」为由改价。
- ⚠️ **抽卡种子：出厂号必须懒播种**（2026-10-19 修）。`emptyPlayerCards().seed` 恒为 `FRESH_SEED=1` 而 `seedFrom` 从未被调用 → 全员共用同一条序列、首抽十连一字不差。修法三处：`initialSeedFor(name)`、`drawCards` 里 `seed===FRESH_SEED` 现算、`mulberry32` 丢弃前 2 个输出（小种子第二输出 0.0027 会把卡钉在 `c001`）。`nextSeed` 下限改 2，**绝不能回到 1**。单测 `test-seed.js` 31 项。
- **卡牌**：71 张，自编号 001~071 只许追加；持久化 `poker:cards`；选人记忆走 sessionStorage `pk:cardOwner`（**immediate watcher 赋值处必须直接 `writeOwnerName()`**）；`PITY_3=10`/`PITY_5=60` + 第 50 抽起 +6%。演出 `CardDrawStage.vue` z 3500。

## 今日结算 · 领奖台
`DailyPodium.vue`（z 3200）固定「亚军-冠军-季军」，子账号上台、`owner` 归主账号；冠军每天免费单抽一次。状态存 `poker:daily`。
- ⚠️ 新 localStorage key **必须登记 `STORAGE_KEYS`**，否则写 `"undefined"` 脏键、功能静默失效。
- ⚠️ append body 的全屏节点**不能用 `<transition>` 收场**；入场 keyframes 不写 opacity、不加 `fill-mode:both`。

## 结算抽屉 · 本局奖券
自绘深海军蓝头图 → 冠军卡压边（**必须在 `.result__top`**）→ 盈亏条（中线零点，红右绿左）→ 转账卡 → 金券卡 → 固定 footer。
- ⚠️ `.el-drawer__body{padding:0;overflow:hidden}` **必须写在全局 `<style>`**。0 盈亏 `barWidth` 返回 0。
- ⚠️「去抽卡」也算本局结束：关抽屉 320ms 后 `resetBoard()`，用 `settling` 做闸门。
- 奖券明细要写清「刷新了哪几项纪录 / 点亮了哪几枚勋章」：`buildNewRecords()`；调用方须在 history unshift **前**存旧数组。⚠️ 按记录项 `dir` 比方向。
- ⚠️ **只有 `ticket:true` 的 5 项计券**（单局最高积分/碾压王/单局最惨/翻盘王/连败终结者）。累计型一律 `ticket:false`——它们每打一局数值自然变大，照旧口径每局白送 10~20 券。新加记录项先分清「这一局发生的事」还是「攒出来的」。

## 视觉主题
`src/styles/theme.css`（main.js 里**必须排在 element 之后**）：深海军蓝顶栏 + 香槟金，主色 #3a55c8（避开绿=跌色），页面底 #eef1f8，卡片 16 圆角。
- 主页 toolbar 一行预算：1440 下 main 523 + tools 770 ≤ 1358，**别把 tool 字号加回 14**。
- ⚠️ `el-row/el-col` 是 float，`align-items:stretch` 无效。

## 工程
单测 `/tmp/pokertest/`（跨重启会丢；同步：`cp src/core/*.js` 后 perl 给 import 补 `.js` 后缀）。浏览器实测用 agent-browser。金额 `money.js`、持久化 `storage.js`、CSV 带 BOM。
- 远程两个：`origin`=gitee 旧库（**永不 push**，考古用）；`github`=`git@github.com:fanyuzhe-github/texas-poker.git`（**主远程，推 master**）。`.workbuddy/preview/`、`legacy-cards-sprite96/`、`testdata/` 均已 gitignore。
- **线上站点**：<https://fanyuzhe-github.github.io/texas-poker/>（GitHub Pages，仓库 Public）。push master 时 `.github/workflows/deploy.yml` 自动 build + `deploy-pages@v4`；`publicPath:"./"` 在子路径下正好可用。
- ⚠️ **`.npmrc` 的 `legacy-peer-deps=true` 别删**：`less-loader@11` peer 只收 `webpack@^5`，vue-cli 4 锁 `webpack@4.47.0`，npm 10 直接 ERESOLVE（CI 上 `npm ci` 与兜底 `npm install` **双双失败**）。本地这套组合 build 一直通 → **别为此降级 less-loader**。
- ⚠️ **`package-lock.json` 不能留 `registry.npmmirror.com`**：1412 个 `resolved` 曾写死该域名，Actions runner 在海外 → 已批量换成 `registry.npmjs.org`。以后重新 `npm install` 要复查。
- ⚠️ **本机 `npm ci` 必定 OOM**（exit 137）→ 别指望本地复现 CI 安装。⚠️ **Actions 日志下载要管理员 token**（公开仓库也 403），机器里没有 GitHub token → CI 报错只能让用户在浏览器里贴。
- **测试数据**：`node .workbuddy/scripts/gen-test-data.mjs` 生成 `.workbuddy/testdata/poker-test-data.json`（导入走「设置 → 数据备份 → 覆盖导入」）；`verify-test-data.mjs` 用真实 core 复验，改完数据必跑。⚠️ 两脚本都用「cp core → 临时目录 + perl 补 .js 后缀」import 源码。
- ⚠️ **段位只有 ±100 元**，造数据要压住局数与波动：23 局 × 10 元底注就把 7 人顶到 6 个档位；40+ 局或 200 元底注会让分数飙到 ±1000，全员挤在两档。
- ⚠️ 总榜积分列曾 66px，`160.00` 会折行 → 已改 78px + `nowrap;tabular-nums`，别调回去。
- 造数据正确姿势：**每局零和**、**players 由 history 走 `applyOutcome` 重放**（手写必打架）、时间戳覆盖冬季跨年才有 4 个赛季。

## 云同步
**用户场景**：一个人记账，牌友不写数据。痛点只有**怕数据丢** + **换设备接着用**。不需要多人实时、不需要分享给牌友。

### 已上线：GitHub Gist 备份（commit `6ed3c92`）
- `src/core/sync.js`（纯函数，`test-sync.js` 43 项）：`buildSnapshot`/`parseSnapshot`/`decideSync`/`snapshotSize`/`isSnapshotTooBig`
- `src/utils/gist.js`（唯一发请求处）：15s 超时、401/403/404/422 转中文、`truncated` 时用 `raw_url` 补全
- `STORAGE_KEYS.cloud = "poker:cloud"`：`loadCloud/saveCloud/clearCloud`，字段 `token/gistId/lastSyncAt/autoBackup/syncedUpdatedAt`
- `GameDetail.vue`：设置弹窗「云备份」区；结算末尾（grantCards 之后）调 `autoBackupToCloud()`
- ⚠️ **不需要压缩库**：`history` 有 `slice(0,200)` 硬上限，快照到不了 gist 的 1MB 截断线
- ⚠️ 恢复一律先弹确认框，靠 `decideSync` 区分「云端比本机新」/「与上次同步一致」；本地基线用 `syncedUpdatedAt`
- ⚠️ 自动备份失败弹 **warning**（不能静默，否则用户以为安全）；手动备份失败弹 error
- 进云：`players`/`history`/`settings`/`cards`；**`daily` 不进云**（跨天作废）
- 安全：fine-grained PAT **只勾 `gists: read and write`**；gist 设 secret；**别让用户把 token 发给 AI**

### 用户嫌麻烦，在评估实时方案（2026-10-19 晚）
麻烦点：token **90 天过期** + 换设备要**手动点恢复**。额度核实（2026-10 官方页）：
- **Supabase 免费**：500MB 库、Realtime 200 并发/2M 消息月、单消息 256KB；⚠️ **7 天不活动自动暂停**
- **Appwrite 免费**：同为 7 天暂停，⚠️ **暂停满 90 天删库** → 排除
- **腾讯云开发免费**：3000 资源点/月、1 环境、**6 个月续期一次**、需实名；国内最快
- **Deno Deploy 免费**：1M 请求月、1GiB KV、**不休眠**、不用实名/信用卡、`kv.watch()` 原生实时
- **Firebase**：国内被墙 → 排除
- ⚠️ **打牌间隔常 2~3 周，正好落在 7 天暂停区** → 「不活动即休眠」的免费层不适合本场景
- 实测（有代理）：腾讯云 0.23s < Cloudflare 0.46s < Supabase 1.16s < Deno 1.30s
- 推荐：**Deno Deploy + KV**（后端约 120 行，前端 fetch + EventSource，**零新 SDK**）；备选腾讯云开发
