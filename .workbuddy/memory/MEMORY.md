# 德州扑克结算工具 — 长期约定

## 技术栈
Vue 2.6 + Element UI 2.15 + vue-cli 4（勿升级）；build/dev 都要 `NODE_OPTIONS=--openssl-legacy-provider`；装包带 `--registry=https://registry.npmmirror.com`。dev server 随会话退出，打不开就 `npm run serve -- --port 8080`。

## 玩家体系
三种账号：子账号（`parent`）· 主账号（`isMain=true`）· 独立号。**三种都能上桌**（2026-10-18 改，原设计是主账号永不上桌）。今日榜 `buildTodayRanking`（不归集）；总榜 `buildMainRanking`（主账号汇总）。
- `selectableNames` 现在**返回全名册、不过滤主账号**；「同主账号一局只出一个号」交给 `limitOnePerMain`（主账号和它自己的子号算同一组，后选的顶掉先选的，`GameDetail` 的 watch 会弹「同一个主账号只能上一个号」）。
- ⚠️ 主账号亲自上桌**不会翻倍**：战绩只记在自己头上，`buildMainRanking` 的 `members=[main, ...children]` 天然各算一次。实测三哥自己赢 10 → 汇总 117→127（76+41+10）。
- ⚠️ `buildTodayRanking` 判断「主账号是否真上过桌」要看**今日榜这一行自己的 `raceResult`**（`totalGames(player) > 0`），不能看总库 `ref` —— 总库那份可能还是 0 场，会把真上过桌的主账号误剔。
- ⚠️ 积分只记在实际下场的号头上，汇总一律实时算（两处都算过会翻倍）。改名/解绑/换头像要同时写 `allPlayers` 与今日榜 `players`。
- ⚠️ **删局/清空流水必须走 `rebuildPlayersFromHistory`**（`core/ranking.js`，按 time 升序整体重放，只重建 5 个战绩字段）。`applyOutcome` 只能往前累加，退不回去——只改 `history` 不重建，总榜/段位/记录/勋章会继续按幽灵牌局算账。今日榜重建要加当天 `filter`，否则删旧账会冲掉今天的分。
- ⚠️ **选人列表不预置任何默认昵称**（`DEFAULT_PLAYER_NAMES` 那 6 个已于 2026-10-18 删除）：`playerOptions` 只来自 `selectableNames(allPlayers)`；空名册靠 `el-select` 的 `slot="empty"` 提示「敲名字回车自动入库」（`allow-create`）。

## 头像
三档：自定义照片 → 卡牌头像 `card:c031` → 昵称色块（FNV-1a → 12 组渐变）。`core/avatar.js` 只做解析/解锁（core 不许 import 图片），卡图由 `utils/cardArt.js`（`require.context`）装配，`PlayerAvatar.vue` 是唯一渲染入口。上传 canvas 裁方 →128×128 JPEG。尺寸：下拉20/座位26/明细24/榜24·20/管理26·22/领奖台72·52。
- 卡牌头像解锁：**严格按拥有**（`isAvatarUnlocked` 只看 `owned[id] > 0`，与星级无关；卡包挂主账号，子账号按 `player.parent` 取）。⚠️ 1★ 30 张「默认全开」的兜底已取消（用户见「卡包 1 张却有 30 多个头像」质疑）→ 没卡就 0 个头像。未解锁的卡在选择器里**完全不渲染**（曾画灰圆 `?` + 星数，别复活）；唯一例外是当前正在用的那张（`legacy:true`，title 标「已不在卡包里」）。0 张时显示空态引导去抽卡。外环按星级 1灰/2蓝/3紫/4金/5彩虹（`STAR_RING_TONE`，5★ 走 conic），环宽 `min(4, max(1.5, px*0.075))`。
- ⚠️ `.pav` 必须 `box-sizing:border-box`（卡牌头像靠 padding 描环，否则尺寸被撑大）；卡图 `object-fit:contain` + 白底，用 cover 会切掉翅膀。
- ⚠️ 24 只动物内置头像**已下线**（2026-10-18 用户要求换成卡牌），`builtin:xxx` 在 `normalizeAvatar` 里被清空回落色块，别再加回。
- ⚠️ 头像+名字+标签必须同一 flex 容器居中（`.cell-name` `flex;align-items:center;gap:6px`，tag 放里面）。

## 段位
`core/tier.js` 12 档：`<-100` / `-100~100` 每 20 一档 / `>100`（含下不含上，只有 80~100 含 100）。称号从输到赢：人形ATM·慈善赌王·散财童子·资深韭菜·充值战神·萌新韭菜·小富即安·奶茶富翁·牌桌新贵·割韭狂魔·点石成金·赌神下凡（别拆「韭菜→镰刀」线）。每档吐槽文案走 `tierTip`。
- **只在「本局座位」显示**，RankTable 段位列已移除。座位行是临时对象 → 段位回**当前赛季积分表**取 `tierScoreOf`（2026-10-19 改，原来是总榜累计）。
- ⚠️ 赛季积分来自 `season.js` 的 `buildSeasonScores(history, players, now)` → `Map<主账号名, 赛季分>`：只筛本赛季流水 + `mainOf` 归集求和，**不重放连胜**（比 `buildSeasonReport` 轻，适合跟着渲染走）。主账号自己上桌也归到自己这组。
- ⚠️ **本赛季没上过桌的账号不在表里**：取不到按 0 分 → 显示「小富即安」，tooltip 会补一句「本赛季（2026 秋）还没上过桌」加以区分，别当成真打了个平手。
- 单测：`test-tier.js` 47 项 + `test-season-scores.js` 9 项（跨年冬季合并、夏季数据排除、子号归集）。

## 座位表 · 筹码
加买已删（`buyIn` 恒等 `baseChips`）。筹码入口是弹窗（末列 `el-icon-coin`），取消 = 还原快照。换算 1000/500/100/50 → 1/0.5/0.1/0.05，走 money.js 整数分。

## 模块中心（全屏）
`ModuleStage.vue` 7 视图共用 Tab 切换。`fixed;inset:0;z-index:3000`，append body，关闭先 `--closing` 淡出 220ms（**不用 `<transition>`**）。图表 `mounted` 初始化 / `beforeDestroy` dispose；切模块销毁重建，不做 keep-alive。Esc 走 document 冒泡（演出层 capture 截停）。
- **选人禁 `el-select`**（popper 2015 会被 3000 压住）→ 头像卡横排。加模块要同时改 `MODULES` 和模板 `v-else-if`。

## 统计（口径全在 core 纯函数）
子账号用 `mainOf()` 归主账号；金额全程整数「分」；并列排序用 `compareName()` 码点（**禁 `localeCompare`**）。依赖单向：records → season → streak → stats。
- **看板**：涨红跌绿，资金曲线避开红绿；新图加进 `renderCharts()`。
- **streak**：取 `record.result`（不用 delta 推导）；平局不打断也不计次；`bestRun`（赚钱最多）≠ `longestWin`。
- **season**：冬跨年；翻页 4 进制；积分从 history 重放。
- **记录榜** `records.js`（`RecordBoard.vue` 3 列）：14 项三组 —— 高光 6 / 至暗 5 / 韧性 3。⚠️ 已删「铁人出勤」「当日最高积分」「最长不输光」——韧性时刻别再加「没发生的坏事累计多久」类口径。胜率门槛 `RATE_MIN_GAMES=5`；输光 = `chips<=0 && delta<0`；「最惨」只收负分；翻盘王 = 输光后下一局真赢回。四项新纪录：碾压王（领先次席最多，需 ≥2 主账号同桌 + top>0 + margin>0）· 最猛一波（`bestRun` 赚最多，cents>0）· 不死小强（爬起来的**次数**，0 次不进榜）· 连败终结者（连败 ≥2 场后那局赢最多，平局不打断）。
- **勋章** `achievements.js`：28 枚 = 荣誉15+连胜8+黑章5。⚠️「首胜」已删；⚠️ 座位表不展示勋章；⚠️ 赛季冠军必须等 `isSeasonClosed`，解锁时刻 = `seasonEndAt()`（`countNewMedals` 用时间窗口，不能 `time===game.time`）。荣誉区 5 枚新章：一网打尽(金,他人汇总 delta 全<0)·零封之夜(银)·常胜将军(银)·盆满钵满(金)·牌桌老炮(铜)。
- ⚠️ **抽卡经济已定稿不要再动**（2026-10-18 用户拍板维持现状）：单抽 3 / 十连 21 券。已实测：首局单人 40 券≈13 抽、稳态每局 2.2 券（落差 18 倍）；集齐 71 张中位 410 抽；12 周时间轴第 1 周到 37%、第 12 周才 72%。**用户明确接受「第一天吃撑、后面变慢」**，理由：线下聚会第一晚就有卡有头像是好体验，图鉴当长期背景目标。后续别再以「发券太快」为由改价/改规则；真要调只能在说明清楚的前提下重提。
- ⚠️ **抽卡种子：出厂号必须懒播种**（2026-10-19 修）。`emptyPlayerCards().seed` 恒为 `FRESH_SEED=1`，而 `seedFrom` 当年写了却从没被调用 → **所有新号共用同一条序列，首抽十连一字不差**（实测 8 人全部 `c001 c030 c009 c022 …`，用户报「怎么每个玩家前几张都是这 4 张」）。修法三处：(1) 新增 `initialSeedFor(name)` = `seedFrom("poker:cards:"+name)`（撞 1 则取 0x9e3779b9）；(2) `drawCards` 里 `seed===FRESH_SEED` 就现算，老存档有 seed 的照旧；(3) `mulberry32` 丢弃前 2 个输出 —— 小种子第二个输出会是 0.0027，正好把卡钉在 `c001`。另 `nextSeed` 下限改 2，绝不能回到 1（否则又被当新号重播种、序列原地打转）。单测 `test-seed.js` 31 项锁死。
- **卡牌**：71 张，自编号 001~071 只许追加；持久化 `poker:cards`；选人记忆走 sessionStorage `pk:cardOwner`（**immediate watcher 里赋值处必须直接 `writeOwnerName()`**）；`PITY_3=10`/`PITY_5=60` + 第 50 抽起 +6%；单抽 3 / 十连 21；**首局大放送是用户确认保留的**。卡面 179×239 `aspect-ratio:3/4`，`.tile` 必须 border-box。演出 `CardDrawStage.vue` z 3500，翻牌不带 animation-delay。

## 今日结算 · 领奖台
`DailyPodium.vue`（z 3200）固定「亚军-冠军-季军」，子账号上台、`owner` 归主账号；冠军每天免费单抽一次（`{free:true}`）。状态存 `poker:daily`。
- ⚠️ 新 localStorage key **必须登记 `STORAGE_KEYS`**，否则写 `"undefined"` 脏键、功能静默失效。
- ⚠️ append body 的全屏节点**不能用 `<transition>` 收场**；入场 keyframes 不写 opacity、不加 `fill-mode:both`。

## 结算抽屉 · 本局奖券
`:with-header="false"` 自绘深海军蓝头图 → 冠军卡压边（**必须在 `.result__top`**）→ 盈亏条（中线零点，红右绿左，按 `resultMaxAbs` 归一化 50%）→ 转账卡 → 金券卡 → 固定 footer（复制/再来一局/关闭）。
- ⚠️ `.el-drawer__body{padding:0;overflow:hidden}` **必须写在全局 `<style>`**。
- 0 盈亏 `barWidth` 返回 0；入场动画只用 transform。
- ⚠️「去抽卡」也算本局结束：关抽屉 320ms 后 `resetBoard()`，用 `settling` 做闸门。
- 奖券明细要写清「刷新了哪几项纪录 / 点亮了哪几枚勋章」：`buildNewRecords()` 返回 `{主账号:{count,items:[{key,title,value}]}}`；`cards.detailsOf()` 兼容三种入参。⚠️ 按记录项 `dir` 比方向（最惨三项 -1）；调用方须在 history unshift **前**存旧数组。
- ⚠️ **只有 `ticket: true` 的 5 项记录计券**（单局最高积分 / 碾压王 / 单局最惨 / 翻盘王 / 连败终结者）。累计型（赛季·当日·连胜·连败·输光次数·胜率·最猛一波·不死小强）**一律 `ticket: false`**——它们每打一局数值就自然变大，照旧口径每局白送 10~20 券（实测第 2 局跟第 1 局打得一样仍发 40 券；改后首局 59→24 券、复制局 40→9 券）。新加记录项先分清「这一局发生的事」还是「攒出来的」，攒出来的不发券。

## 视觉主题
`src/styles/theme.css`（main.js 里**必须排在 element 之后**）：深海军蓝顶栏 + 香槟金，主色 #3a55c8（避开绿=跌色），页面底 #eef1f8，卡片 16 圆角。
- 主页 toolbar 一行预算：1440 下 main 523 + tools 770 ≤ 1358，**别把 tool 字号加回 14**。
- ⚠️ `el-row/el-col` 是 float，`align-items:stretch` 无效；座位表保持自然高度。

## 工程
单测 `/tmp/pokertest/`（跨重启会丢；同步：`cp src/core/*.js` 后 perl 给 import 补 `.js` 后缀）。浏览器实测用 agent-browser（独立 profile）。金额 `money.js`、持久化 `storage.js`、CSV 带 BOM。`.workbuddy/scripts/`：`gift-tickets.js`/`seed-demo.js`/`svg2png`（换卡图必须 `density:300`）。**git 已入库**。远程有两个：`origin`=gitee 旧库（2024 年、已分叉，**永不 push**，留着考古）；`github`=`git@github.com:fanyuzhe-github/texas-poker.git`（主远程，推 `master`）。`.workbuddy/preview/`、`legacy-cards-sprite96/`、`testdata/` 均已 gitignore。
- **线上站点**：<https://fanyuzhe-github.github.io/texas-poker/>（GitHub Pages，仓库 Public）。`.github/workflows/deploy.yml` 在 push master 时自动 build + `deploy-pages@v4` 发布；`vue.config.js` 的 `publicPath:"./"` 在子路径下正好可用（产物是 `css/app.xxx.css` 这类相对路径，已实测全部 200）。
- ⚠️ **`.npmrc` 里的 `legacy-peer-deps=true` 别删**：`less-loader@11.1.3` 的 peer 声明只收 `webpack@^5`，而 vue-cli 4 锁 `webpack@4.47.0`，npm 10 会直接 ERESOLVE 让 `npm ci` 挂掉（CI 表现：`npm ci` 和兜底的 `npm install` **双双失败**）。这套组合本地 build 一直是通的 → 跳过校验是正解，**不要为此降级 less-loader**（降级要重生成 lock，反而没验证过）。
- ⚠️ **`package-lock.json` 里不能留 `registry.npmmirror.com`**：当初装包用国内镜像，1412 个 `resolved` 全写死了该域名，Actions runner 在海外 → 已批量替换成 `registry.npmjs.org`（tarball 一致，integrity 不受影响）。以后本地重新 `npm install`，记得检查锁里的源有没有被改回去。
- ⚠️ **本机 `npm ci` 必定 OOM**（exit 137，沙箱内外一样）→ 别指望本地复现 CI 安装步骤。⚠️ **Actions 日志下载要管理员 token**（`GET .../actions/jobs/{id}/logs` 返回 403 `Must have admin rights`，公开仓库也一样；`annotations` 接口是 404），机器里没有任何 GitHub token → CI 报错只能让用户在浏览器里贴。
- **测试数据**：`node .workbuddy/scripts/gen-test-data.mjs` 生成 `.workbuddy/testdata/poker-test-data.json`（`app:"texas-poker"`，可走「设置 → 数据备份 → 导入备份 → 覆盖导入」）；`verify-test-data.mjs` 用真实 core 复验 14 项记录/段位档数/勋章数/赛季数/卡包口径，改完数据必跑。⚠️ 两个脚本都用 `cp core → 临时目录 + perl 补 .js 后缀` 的方式 import 源码（源码 import 无后缀，Node 直接跑不了）。
- ⚠️ **段位只有 ±100 元（12 档 × 20 元）**，造数据时局数和单局波动必须压住：23 局 × base 10 元就已经把 7 人顶到 6 个档位。设成 40+ 局或塞 200 元底注豪赌局，分数会飙到 ±1000，全员挤在「人形 ATM / 赌神下凡」两档，段位等于白做。
- ⚠️ **总榜积分列曾固定 66px**：三位数 `160.00` 会被折成两行（粗体 13px 装不下）。已改 78px + `.score{white-space:nowrap;font-variant-numeric:tabular-nums}`，别再调回去。
- 造数据的正确姿势：**每局零和**（sum(delta)=0）、**players 一律由 history 走 `applyOutcome` 重放**（手写 score/raceResult 必然和流水打架）、时间戳覆盖冬季跨年才有 4 个赛季。

## 云同步（2026-10-19 已上线：GitHub Gist 备份）

**用户场景（问过本人）**：**一个人记账**，牌友不写数据。痛点只有两个 —— **怕数据丢** + **换设备能接着用**。
明确**不需要**多人实时协作，也**不需要**发给牌友看。
→ 结论：**不要上实时数据库**（Supabase/云开发），单写者场景为并发冲突引入 Postgres 是过度设计。

**选定方案：GitHub Gist 当云端存档**（零注册，用户已有 GitHub 账号；数据全 JSON、几百 KB，一个 gist 文件装得下）。

落地要点（动手前先看）：
- 分层：`src/core/sync.js` 放纯函数（打包/解包/冲突判定，可进单测）；`src/utils/gist.js` 放网络请求
  —— core 不许有副作用，别把 fetch 写进 core
- 打包进云：`players` / `history` / `settings` / `cards`；**`daily` 不进云**（跨天自动作废，备份它没意义）
- 快照带 `app:"texas-poker"` + `schemaVersion` + `updatedAt`，导入时校验
- ⚠️ 新 key（token / gistId / lastSyncAt）**必须登记 `STORAGE_KEYS`**，否则写出 `"undefined"` 脏键
- 单写者仍需 `updatedAt` 兜底：恢复时若云端比本地新，提示「云端有更新的数据，是否覆盖」
- 网络失败**绝不阻断本地使用**——照常能玩，只是没备份；加超时 + 重试 + 明确状态提示（手机端无代理会慢）

**已落地**（commit `6ed3c92`）：
- `src/core/sync.js`（纯函数，单测 `test-sync.js` **43 项**）：`buildSnapshot` / `parseSnapshot`
  / `decideSync(local, remote)` / `snapshotSize` / `isSnapshotTooBig`
- `src/utils/gist.js`（唯一发请求处）：15s 超时、401/403/404/422 转中文、`truncated` 时改用 `raw_url` 补全
- `src/core/storage.js`：`STORAGE_KEYS.cloud = "poker:cloud"`，`loadCloud/saveCloud/clearCloud`，
  字段 `token / gistId / lastSyncAt / autoBackup / syncedUpdatedAt`
- `GameDetail.vue`：设置弹窗加「云备份」表单项；结算流程末尾（grantCards 之后）调 `autoBackupToCloud()`
- ⚠️ **不需要压缩库**：`history` 有 `slice(0, 200)` 硬上限，快照永远到不了 gist 的 1MB 截断线，
  所以没引 lz-string。`isSnapshotTooBig` 只是防御性告警
- ⚠️ 恢复时**一律先弹确认框**（单写者也可能在换设备后误覆盖），靠 `decideSync` 区分
  「云端比本机新」和「与上次同步一致」两种文案；本地基线用 `cloud.syncedUpdatedAt`
- 断网/超时时自动备份会弹 **warning**（不能静默，否则用户以为数据已安全）；手动备份弹 error
- token 由用户自己粘进设置页（**不要让他把 token 发给 AI**），fine-grained 只勾 `gists: read and write`
- 安全：用 **fine-grained PAT，只勾 `gists: read and write` 一项**；gist 设为 **secret**；
  token 存 localStorage 本机，**不要让用户把 token 发给 AI**，让他自己粘进设置页
