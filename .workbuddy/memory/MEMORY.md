# 德州扑克结算工具 — 长期约定

## 工程 / 构建
Vue 2.6 + Element UI 2.15 + vue-cli 4（**勿升级**）。build/dev 要 `NODE_OPTIONS=--openssl-legacy-provider`；装包 `--registry=https://registry.npmmirror.com`。
- 远程：`origin`=gitee 旧库（**永不 push**）；**`github`=`git@github.com:fanyuzhe-github/texas-poker.git`（主远程，推 master）**。
- 线上 <https://fanyuzhe-github.github.io/texas-poker/>：push 后 `.github/workflows/deploy.yml` 自动 build + `deploy-pages@v4`，`publicPath:"./"` 子路径正好可用。
- ⚠️ `.npmrc` 的 `legacy-peer-deps=true` **别删**：`less-loader@11` peer 只收 webpack5，vue-cli4 锁 webpack4.47，npm10 直接 ERESOLVE（`npm ci` 与兜底 install 双双失败）。别为此降级 less-loader。
- ⚠️ `package-lock.json` 不能留 `registry.npmmirror.com`（已换官方源），重装后复查。
- ⚠️ 本机 `npm ci` 必 OOM；Actions 日志要管理员 token（公开仓库也 403）→ CI 报错只能让用户贴。
- 测试数据：`gen-test-data.mjs` 生成 / `verify-test-data.mjs` 复验，改完必跑。每局零和、players 由 history 走 `applyOutcome` 重放、时间戳跨冬季才有 4 个赛季；**段位只有 ±100 元**，23 局×10 元就到 6 档。
- `.workbuddy/preview/`、`legacy-cards-sprite96/`、`testdata/` 已 gitignore。总榜积分列 78px + `nowrap`（66px 时 `160.00` 折行）。

### 单测（`tests/`，21 文件，`npm test`）
- `src/core/**` 内部相对 import **一律带 `.js` 后缀**（webpack 与 node 都认），新文件必须照做，否则 node 报 ERR_MODULE_NOT_FOUND。
- `src/core/package.json` 与 `tests/package.json` 写 `{"type":"module"}`。⚠️ **别给 `src/utils/` 加**：`cardArt.js` 用 `require.context`，声明成 module 会炸。
- `tests/.eslintrc.json` 显式声明 `globals.globalThis` —— 本机 `globals` 包 11.12.0，`env:es2020` 注入不进来。
- 测试里定位素材用 `fileURLToPath(new URL(...))`，**不能用 `URL.pathname`**（不解码，中文路径变 `%E5%89%8D…` 直接 ENOENT）。
- 浏览器实测：Chrome `--headless=new --no-sandbox --proxy-server='direct://' --remote-debugging-port=9222` + `Emulation.setDeviceMetricsOverride` + `Runtime.evaluate` 改 Vue 实例；进程要 `run_in_background`（本机代理会把 127.0.0.1 劫持成 502）。

## 玩家体系
子账号（`parent`）· 主账号（`isMain`）· 独立号，**都能上桌**。今日榜 `buildTodayRanking`（不归集）；总榜 `buildMainRanking`（主账号汇总）。
- `selectableNames` 返回全名册、不过滤主账号；「同主账号一局只出一个号」靠 `limitOnePerMain`（后选顶掉先选）。
- ⚠️ 主账号亲自上桌**不翻倍**：战绩只记自己头上，`members=[main,...children]` 天然各算一次。
- ⚠️ `buildTodayRanking` 判断主账号上没上桌看**今日榜该行自己的 `raceResult`**，不能看总库 `ref`（可能还是 0 场，会把真上桌的误剔）。
- ⚠️ 积分只记在实际下场的号头上，汇总一律实时算（两处都算会翻倍）。改名/解绑/换头像要同时写 `allPlayers` 与今日榜 `players`。
- ⚠️ **删局/清空流水必须走 `rebuildPlayersFromHistory`**（按 time 升序重放，只重建 5 个战绩字段）。`applyOutcome` 只能累加退不回——只改 history 不重建，总榜/段位/记录/勋章会按幽灵牌局算账。今日榜重建要加当天 `filter`。
- 选人列表不预置默认昵称；空名册靠 `slot="empty"` 提示「敲名字回车自动入库」（`allow-create`）。

## 头像
三档：自定义照片 → 卡牌头像 `card:c031` → 昵称色块（FNV-1a → 12 组渐变）。`core/avatar.js` 只做解析/解锁（core 不许 import 图片），卡图由 `utils/cardArt.js`（`require.context`）装配，`PlayerAvatar.vue` 唯一渲染入口。
- 解锁**严格按拥有**（只看 `owned[id]>0`，与星级无关；卡包挂主账号，子账号按 `parent` 取）。⚠️ 1★ 30 张「默认全开」已取消 → 没卡就 0 个头像；未解锁的卡在选择器里**完全不渲染**（别复活灰圆 `?`），唯一例外是当前在用的（`legacy:true`）。外环 1灰/2蓝/3紫/4金/5彩虹。
- ⚠️ `.pav` 要 `box-sizing:border-box`（靠 padding 描环）；卡图 `object-fit:contain` + 白底（cover 会切翅膀）。24 只动物内置头像已下线，`builtin:xxx` 在 `normalizeAvatar` 里清空。头像+名字+标签同一 flex 居中（`.cell-name`）。

## 段位
`core/tier.js` 12 档：`<-100` / `-100~100` 每 20 一档 / `>100`（含下不含上，只有 80~100 含 100）。称号自输到赢：人形ATM·慈善赌王·散财童子·资深韭菜·充值战神·萌新韭菜·小富即安·奶茶富翁·牌桌新贵·割韭狂魔·点石成金·赌神下凡（别拆「韭菜→镰刀」线）。吐槽走 `tierTip`。
- **只在「本局座位」显示**（RankTable 段位列已移除）。座位行是临时对象 → 回**当前赛季积分表**取 `tierScoreOf`。
- ⚠️ 赛季分来自 `buildSeasonScores(history, players, now)` → `Map<主账号名, 赛季分>`：只筛本赛季流水 + `mainOf` 归集求和，**不重放连胜**。没上过桌的账号不在表里 → 按 0 分显示「小富即安」，tooltip 补「本赛季还没上过桌」。单测 `test-tier.js` 47 + `test-season-scores.js` 9。

## 统计 / 记录榜（口径全在 core 纯函数）
子账号用 `mainOf()` 归主账号；金额全程整数「分」；并列排序用 `compareName()` 码点（**禁 `localeCompare`**）。依赖单向：records → season → streak → stats。
- **看板**：涨红跌绿，资金曲线避开红绿；新图加进 `renderCharts()`。**streak**：取 `record.result`，平局不打断也不计次，`bestRun` ≠ `longestWin`。**season**：冬跨年、翻页 4 进制、积分从 history 重放。
- **记录榜 15 项三组**（高光6 / 至暗6 / 韧性3）：高光=单局最高积分·碾压王·赛季最高·最高连胜·最猛一波·最高胜率；至暗=最多输光次数·最长连败·垫底王·当头一棒·高台跳水·长夜漫漫；韧性=翻盘王·不死小强·连败终结者。
  - ⚠️ **「把赢的纪录取反」不算补对称**（`b0e5c2f` 删掉的单局最惨/当日最惨/最惨连败就是这个毛病：同一批局换个颜色重贴）。四条至暗各有画面：垫底（全场最差，≥3 人才记、并列不算）· 当头一棒（连胜≥2 后被终结那局亏最多）· 高台跳水（单日盘中峰值→收盘的落差）· 长夜漫漫（输光后熬过最多局才翻身，≥2 局且必须真翻身）。
  - 已删且**别加回**：铁人出勤（出勤王/连续出勤/元老）、当日最高积分、最长不输光、上面三项。韧性别加「坏事没发生多久」类口径。
  - `RATE_MIN_GAMES=5`；输光=`chips<=0&&delta<0`；翻盘王=输光后下一局真赢回。
- **勋章** 28 枚 = 荣誉15+连胜8+黑章5。⚠️「首胜」已删；座位表不展示；赛季冠军必须等 `isSeasonClosed`，解锁时刻 = `seasonEndAt()`。
- ⚠️ **抽卡经济已定稿别再动**（2026-10-18）：单抽 3 / 十连 21。用户明确接受「第一天吃撑、后面变慢」。复算脚本在 `scripts/`：`npm run sim`（4 个经济模拟）、`npm run check:seed`（3 个种子校验）——**要调价先用它算，别凭感觉**。
- ⚠️ **抽卡种子必须懒播种**：出厂 `seed=FRESH_SEED=1`，靠 `initialSeedFor(name)` + `drawCards` 现算；`mulberry32` 丢弃前 2 个输出；`nextSeed` 下限 2，**绝不再回到 1**。`test-seed.js` 31 项。
- **卡牌**：71 张，编号 001~071 只许追加；持久化 `poker:cards`；选人记忆 `pk:cardOwner`（immediate watcher 处必须直接 `writeOwnerName()`）；`PITY_3=10`/`PITY_5=60` + 第 50 抽起 +6%。演出 `CardDrawStage.vue` z 3500。

## 座位表 / 模块中心 / 今日结算
加买已删（`buyIn` 恒等 `baseChips`）；筹码入口是弹窗（末列 `el-icon-coin`），取消 = 还原快照；换算走 money.js 整数分。
- `ModuleStage.vue` 7 视图共用 Tab：`fixed;inset:0;z-index:3000`，append body，关闭先 `--closing` 淡出 220ms（**不用 `<transition>`**）。图表 `mounted` 初始化 / `beforeDestroy` dispose，不做 keep-alive，Esc 走 document 冒泡。⚠️ **选人禁 `el-select`**（popper 2015 被 3000 压住）→ 头像卡横排；加模块要同时改 `MODULES` 和模板 `v-else-if`。
- `DailyPodium.vue`（z 3200）固定「亚军-冠军-季军」，子账号上台、`owner` 归主账号；冠军每天免费单抽一次，状态存 `poker:daily`。
- ⚠️ 新 localStorage key **必须登记 `STORAGE_KEYS`**，否则写 `"undefined"` 脏键、功能静默失效。
- ⚠️ append body 的全屏节点**不能用 `<transition>` 收场**；入场 keyframes 不写 opacity、不加 `fill-mode:both`。
- 抽屉结构：深海军蓝头图 → 冠军卡压边（**必须在 `.result__top`**）→ 盈亏条（中线零点，红右绿左）→ 转账卡 → 金券卡 → 固定 footer。⚠️ `.el-drawer__body{padding:0;overflow:hidden}` **必须写在全局 `<style>`**；0 盈亏 `barWidth` 返回 0。
- ⚠️「去抽卡」也算本局结束：关抽屉 320ms 后 `resetBoard()`，用 `settling` 做闸门。
- 奖券明细要写清「刷新了哪几项纪录 / 点亮了哪几枚勋章」：`buildNewRecords()`，调用方须在 history unshift **前**存旧数组，按记录项 `dir` 比方向。⚠️ **只有 `ticket:true` 的 5 项计券**（单局最高积分/碾压王/当头一棒/翻盘王/连败终结者）；累计型一律 `ticket:false`（否则每局白送 10~20 券）。

## 视觉 / 响应式
`theme.css`（main.js 里**必须排在 element 之后**）：深海军蓝顶栏 + 香槟金，主色 #3a55c8（避开绿=跌色），页面底 #eef1f8，卡片 16 圆角。
- 主页 toolbar 一行预算：1440 下 main 523 + tools 770 ≤ 1358，**别把 tool 字号加回 14**。⚠️ `el-row/el-col` 是 float，`align-items:stretch` 无效。
- `src/mixins/responsive.js` 是**唯一**断点来源：`isMobile`(≤768) / `isCompact`(≤1024)。
- ⚠️ 手机适配靠**换结构**不是缩宽度：座位表 6 列要 616px，`isCompact` 直接渲染 `.seat-list` 卡片（`minmax(240px,1fr)` 自动 1→2 列）；玩家管理同理换卡片列表。
- 表格类用 `compact` prop 砍列：`RankTable` 砍胜率/状态，`SeasonRank` 砍胜/负·胜率·连胜·最佳单局·出勤（留名次/玩家/积分）。
- ⚠️ `el-dialog` 的 width 是内联 style → 只能在 theme.css 用 `!important`；≤768 统一 `100vw-24` + flex 列布局（头/底固定、body 自滚）。
- ⚠️ `.humane-model` 是 absolute，≤1024 必须回文档流，否则压住结算按钮。

## 流水容量（`2023c1b`，别再改回计数上限）
`core/history.js`：`gameBytes` 按 **UTF-8 字节** + `trimHistory(list, maxBytes)`。
- `HISTORY_MAX_BYTES=600KB`（≈2000 局，压在 gist `SNAPSHOT_SIZE_WARN=900KB` 之下）。**从最新往前装**，只留连续前缀，最新一局即使单局超预算也不裁。`test-history.js` 30 项。
- ⚠️ 老写法 `[game,...history].slice(0,200)` 是**静默算错账**：第 201 局起赛季积分 / 记录榜 / 勋章重放全少算。任何「限制流水条数」都不许再出现，只能限体积，`dropped>0` 必须告诉用户（`notifyHistoryTrim`，一次会话一次）。
- 云端恢复（`applySnapshot`）、本地导入（`applyBackup`）同样过 `trimHistory`；导入前先按 `time` 倒序排，否则裁剪会砍错局。
- ⚠️ **`HistoryPanel` 必须分页**（20 局 + 「加载更早的 20 局」）：`el-collapse-item` 折叠时内部 `el-table` 也会渲染，几千局会卡死手机。

## 落盘返回值（`2023c1b` 起）
`savePlayers/saveHistory/saveCards/saveSettings/saveDaily/saveCloud` 都返回 boolean，**调用方必须接**。
- 已有检查：结算、改名、删玩家、删局、清空流水、导入、云端恢复、底注设置、保存 token、新玩家入库、解除归属。
- 约定：写失败 → `$message.error` 说清「刷新后会退回/复原」，**不要**再提示「已保存」。唯一例外是 `resetSeat` 里名册存不下：照样开局，只报警告。

## 云同步
**用户场景（本人确认）**：**单机记账**，一次只有一台电脑在用。痛点只有**怕数据丢** + **换设备能拿到之前的数据**；**不需要多人实时同步**。
→ **Gist 冷备份是主路径**；Deno 实时同步**已彻底删除**（`df5e501` 去 UI / `2231319` 去代码：`utils/live.js`、`server/`、`deno.json`、`normalizeCloud` 里六个 live 字段全删），**别再加班回来**。
- `core/sync.js` 纯函数（`test-sync.js` 43 项）+ `utils/gist.js`（唯一发请求，15s 超时，状态码转中文，`test-gist.js` 10 项）。`STORAGE_KEYS.cloud="poker:cloud"`：`token/gistId/lastSyncAt/autoBackup/syncedUpdatedAt`。
- ⚠️ **换设备的关键 = `findGistId()`**：gistId 只存第一台电脑的本机。新设备光有 token 找不到存档 → 列出该 token 名下 gist，按备份文件名 `texas-poker-backup.json` 认领（多份取最新）。上传/恢复/启动检查**三处都先认领**。
- ⚠️ **安全闸 `guardBeforeUpload`**：本机 `syncedUpdatedAt` 为 0（没对过账）而云端已有存档 = 本机是新设备，**自动备份一律不覆盖**，手动上传也要弹确认。否则新设备会拿空数据抹掉真数据（本项目最容易出事的一步）。
- `checkCloudOnStart()`：打开页面自动比对云端，新设备（基线 0）直接弹恢复提示。本地改动走 `onLocalChange` → **3 秒防抖**自动备份。
- 恢复先弹确认；自动备份失败弹 **warning**（静默会让人以为安全）；`daily` 不进云；PAT 只勾 `gists`，**别让用户把 token 发给 AI**；classic PAT 可选 **No expiration**。
- ⚠️ **必须 classic token**：细粒度（`github_pat_` 开头）**没有 gist 权限**，`isFineGrainedToken()` 保存时拦下提示换 `ghp_`。
- ⚠️ 换 token 走「更换 token」（`cloudTokenEditing`）；保存时**清掉 `gistId`** 让它重新按文件名认领（换账号 = 换网盘）。别改回「存过 token 就藏起输入框」。
- 不需要压缩库（history 按体积保留，碰不到 gist 1MB 截断线）。

## PWA / 添加到主屏幕（`34e1e5d`、`7c0f732`、`a698f4f`）
`public/manifest.json`（`start_url "./"`、`display:standalone`、192/512/maskable）+ `index.html` 的 manifest / theme-color / apple-touch-icon / iOS 三个私有 meta。**不加 Service Worker**（单机记账要读最新账，缓存会给旧数）。
- 图标源脚本：`.workbuddy/scripts/make-pwa-icons.py`（纯 Python 写 PNG，零依赖）→ 输出 `public/`。改图形调 `SPADE_PATH`/`graphic_scale` 重跑，别手工 P 图覆盖。
- ⚠️ **`favicon.ico` 也归它管**（`write_ico()`，16/32/48 三档 PNG-in-ICO，graphic_scale 0.76）。只换 PWA 图的话，标签页还是 vue-cli 的绿色 V。
- ⚠️ **改完图标必须 bump `index.html` 里 favicon 的 `?v=`**：favicon 缓存极顽固，不换查询串几天都不更新。
- ⚠️ 黑桃只能用贝塞尔轮廓：10 段 M/C（尖顶→外扩翼→缓弧翼底→内凹收腰→外扩梗→镜像）。「三角+两个圆」拼法在 48px 下就是一朵梅花；**梗两侧控制点 x 必须单调内收**（否则谷底鼓两个尖包）；横向压到 0.78。
- 配色在 `PALETTES`（navy-gold / ivory-navy / crimson-ivory），`--compare` 出对比图；金色**只做竖直渐变 + 很弱左上受光**（加右下背光会压出脏暗斑）。多尺寸预览 `preview()` 512→32，**小尺寸才是手机桌面真实观感**。
- ⚠️ `apple-mobile-web-app-status-bar-style` 用 `black`（`black-translucent` 会让内容顶到状态栏底下）；manifest 与图标路径必须相对。
- iOS 是先截图再存图标：**改完图标要删掉旧桌面图标再加一次**。

## 已明确否决（别再当待办翻出来）
- ❌ 拆 `GameDetail.vue`（3800 行）：收益只是好看，风险在结算主路径。
- ❌ 把 `.workbuddy/scripts/` 那 7 个一次性脚本搬进 `scripts/`：纯搬家，内部按 `../../` 定位根目录，零收益。
- ❌ 恢复 Deno / 实时同步（单机记账，免费层长连接会烧穿额度：SSE 让实例长期 loaded，按 768MB×每秒 计费，几小时全站 503）。
