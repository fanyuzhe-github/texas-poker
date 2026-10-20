# 德州扑克结算工具 — 长期约定

## 工程
Vue2.6 + Element UI 2.15 + vue-cli4（**勿升级**）。build/dev 需 `NODE_OPTIONS=--openssl-legacy-provider`；装包用 npmmirror。
- 远程：`origin`=gitee 旧库（**永不 push**）；`github`=`git@github.com:fanyuzhe-github/texas-poker.git`（主远程，推 master）→ `.github/workflows/deploy.yml` 自动 build + Pages（`publicPath:"./"`）。
- ⚠️ `.npmrc` 的 `legacy-peer-deps=true` 别删（`less-loader@11` peer 只收 webpack5，npm10 会 ERESOLVE）；`package-lock.json` 不能留 npmmirror 源。
- ⚠️ 本机 `npm ci` 必 OOM；Actions 日志只有管理员能看（公开仓库也 403）→ CI 报错让用户贴。
- `.workbuddy/preview/`、`legacy-cards-sprite96/`、`testdata/` 已 gitignore。

## 单测（`tests/` 21 文件，`npm test`）
- `src/core/**` 相对 import **一律带 `.js`**（node 要），新文件照做。
- `src/core/package.json`、`tests/package.json` 写 `{"type":"module"}`；⚠️ 别给 `src/utils/` 加（`cardArt.js` 用 `require.context`）。
- `tests/.eslintrc.json` 显式声明 `globals.globalThis`（本机 globals 11.12.0，`env:es2020` 注入不进来）。
- 素材定位用 `fileURLToPath(new URL(...))`，**不能用 `URL.pathname`**（中文不解码 → ENOENT）。
- 浏览器实测：Chrome `--headless=new --no-sandbox --proxy-server='direct://' --remote-debugging-port=9222` + `Emulation.setDeviceMetricsOverride` + `Runtime.evaluate` 改 Vue 实例；进程要 `run_in_background`（本机代理把 127.0.0.1 劫成 502）。

## 玩家 / 上桌
子账号（`parent`）· 主账号（`isMain`）· 独立号。今日榜 `buildTodayRanking`（不归集）；总榜 `buildMainRanking`（主账号汇总）。
- ⚠️ **能否上桌只看「名下有没有子账号」**（`ranking.js` 的 `canSit`，2026-10-20 用户定）：挂着子账号的主账号=汇总容器，不上桌、不进选人列表；没子账号的主账号等同独立号，能上桌。`isMain` 不再决定资格。
- `selectableNames` 已剔除容器；「同主账号一局只出一个号」靠 `limitOnePerMain`；`allow-create` 手敲容器名会被 `selectPlayers` 的 watch 踢掉（只靠选项列表拦不住）。
- ⚠️ 主账号未挂子账号时自己打的战绩仍有效（战绩只记本人，`members=[main,...children]` 各算一次不翻倍）。
- ⚠️ `buildTodayRanking` 判断容器上没上桌看该行自己的 `raceResult`，不能看总库 `ref`；过滤用 `canSit`。
- ⚠️ 积分只记实际下场的号，汇总一律实时算；改名/解绑/换头像要同时写 `allPlayers` 与今日榜 `players`。
- ⚠️ 删局/清空流水必须 `rebuildPlayersFromHistory`（按 time 升序重放 5 个战绩字段）；`applyOutcome` 只能累加退不回。今日榜重建要加当天 filter。
- 选人列表不预置默认昵称；空名册用 `slot="empty"` 提示「敲名字回车自动入库」。

## 头像
三档：自定义照片 → `card:c031` → 昵称色块（FNV-1a→12 组渐变）。`core/avatar.js` 只解析/解锁（不许 import 图片），卡图由 `utils/cardArt.js` 装配，`PlayerAvatar.vue` 唯一入口。
- 解锁**严格按拥有**（`owned[id]>0`，与星级无关；卡包挂主账号，子账号按 `parent` 取）。1★「默认全开」已取消；未解锁在选择器**完全不渲染**（别复活灰 `?`），例外是当前在用的（`legacy:true`）。外环 1灰/2蓝/3紫/4金/5彩虹。
- ⚠️ `.pav` 要 `box-sizing:border-box`；卡图 `object-fit:contain`+白底（cover 切翅膀）；`builtin:xxx` 在 `normalizeAvatar` 清空。头像+名字+标签同一 flex 居中（`.cell-name`）。

## 段位
`core/tier.js` 12 档（`<-100` / `-100~100` 每 20 一档 / `>100`，只有 80~100 含 100）。称号：人形ATM·慈善赌王·散财童子·资深韭菜·充值战神·萌新韭菜·小富即安·奶茶富翁·牌桌新贵·割韭狂魔·点石成金·赌神下凡（别拆「韭菜→镰刀」线）。
- 只在「本局座位」显示（RankTable 已无段位列）；座位行是临时对象 → 回当前赛季积分表取 `tierScoreOf`。
- ⚠️ `buildSeasonScores(history, players, now)` → `Map<主账号, 赛季分>`：只筛本赛季流水 + `mainOf` 求和，**不重放连胜**；没上过桌的账号显示 0 分「小富即安」+ tooltip。`test-tier.js` 47 / `test-season-scores.js` 9。

## 统计 / 记录榜 / 勋章 / 抽卡
子账号 `mainOf()` 归主账号；金额全程整数「分」；并列用 `compareName()` 码点（**禁 `localeCompare`**）。依赖单向：records→season→streak→stats。
- 看板：涨红跌绿，资金曲线避开红绿；新图加进 `renderCharts()`。streak 取 `record.result`，平局不打断不计次；season 冬跨年、翻页 4 进制。
- **记录榜 15 项三组**：高光6（单局最高积分·碾压王·赛季最高·最高连胜·最猛一波·最高胜率）/ 至暗6（最多输光·最长连败·垫底王·当头一棒·高台跳水·长夜漫漫）/ 韧性3（翻盘王·不死小强·连败终结者）。
  - ⚠️「把赢的纪录取反」不算补对称（`b0e5c2f` 删的就是这毛病）。四条至暗各有画面：垫底（全场最差、≥3 人、并列不算）·当头一棒（连胜≥2 被终结那局亏最多）·高台跳水（单日盘中峰值→收盘落差）·长夜漫漫（输光后熬≥2 局才翻身，未翻身不记）。
  - 别加回：铁人出勤三项、当日最高积分、最长不输光、单局最惨/当日最惨/最惨连败；韧性别加「坏事没发生多久」类。
  - `RATE_MIN_GAMES=5`；输光=`chips<=0&&delta<0`；翻盘王=输光后下一局真赢回。
- 勋章 28 枚=荣誉15+连胜8+黑章5；「首胜」已删；座位表不展示；赛季冠军等 `isSeasonClosed`，解锁时刻 `seasonEndAt()`。
- ⚠️ 抽卡经济已定稿（单抽 3 / 十连 21），要调价先跑 `npm run sim` / `npm run check:seed`，别凭感觉。
- ⚠️ 种子懒播种：出厂 `seed=1`，`initialSeedFor`+`drawCards` 现算；`mulberry32` 丢前 2 输出；`nextSeed` 下限 2，绝不回 1（`test-seed.js` 31 项）。
- 卡牌 71 张（001~071 只许追加）；`poker:cards`；`pk:cardOwner`（immediate watcher 直接 `writeOwnerName()`）；`PITY_3=10`/`PITY_5=60`+第 50 抽起+6%；`CardDrawStage.vue` z3500。

## 座位表 / 模块中心 / 结算
加买已删（`buyIn`≡`baseChips`）；筹码入口是弹窗（末列 `el-icon-coin`），取消=还原快照。
- `ModuleStage.vue` 7 视图共用 Tab：`fixed;inset:0;z-index:3000`，append body，关闭先 `--closing` 淡出 220ms（**不用 `<transition>`**）；图表 mounted 初始化 / beforeDestroy dispose；Esc 走 document 冒泡。⚠️ 选人禁 `el-select`（popper 2015 被压）→ 头像卡横排；加模块要同时改 `MODULES` 与模板 `v-else-if`。
- `DailyPodium.vue`（z3200）固定亚-冠-季，子账号上台、`owner` 归主账号；冠军每天免费单抽一次（`poker:daily`）。
- ⚠️ 新 localStorage key **必须登记 `STORAGE_KEYS`**，否则写脏键静默失效。
- ⚠️ append body 的全屏节点不能用 `<transition>` 收场；入场 keyframes 不写 opacity、不加 `fill-mode:both`。
- 抽屉：海军蓝头图 → 冠军卡压边（必须在 `.result__top`）→ 盈亏条（中线零点、红右绿左）→ 转账卡 → 金券卡 → 固定 footer。⚠️ `.el-drawer__body{padding:0;overflow:hidden}` 写全局；0 盈亏 `barWidth`=0。
- ⚠️「去抽卡」也算本局结束：关抽屉 320ms 后 `resetBoard()`，`settling` 做闸门。
- 奖券明细：`buildNewRecords()`，调用方须在 history unshift **前**存旧数组，按 `dir` 比方向。⚠️ 只有 `ticket:true` 的 5 项计券（单局最高积分/碾压王/当头一棒/翻盘王/连败终结者），累计型一律 false。

## 视觉 / 响应式
`theme.css`（main.js 里**排在 element 之后**）：海军蓝顶栏+香槟金，主色 #3a55c8（避开绿=跌），底 #eef1f8，卡片 16 圆角。
- 主页 toolbar 一行预算：1440 下 main 523 + tools 770 ≤ 1358，别把 tool 字号加回 14。⚠️ `el-row/el-col` 是 float，`align-items:stretch` 无效。
- `src/mixins/responsive.js` 是唯一断点：`isMobile`(≤768) / `isCompact`(≤1024)。
- ⚠️ 手机适配靠**换结构**不是缩宽度：座位表 6 列要 616px → `isCompact` 渲染 `.seat-list` 卡片；玩家管理同理。
- 表格用 `compact` 砍列：RankTable 砍胜率/状态；SeasonRank 砍胜/负·胜率·连胜·最佳单局·出勤。
- ⚠️ `el-dialog` 的 width 是内联 style → theme.css 用 `!important`；≤768 统一 `100vw-24` + flex 列。
- ⚠️ `.humane-model` 是 absolute，≤1024 回文档流，否则压住结算按钮。
- ⚠️ 数字列别抠宽度且一律 `nowrap`：总榜积分 78px、胜率 76px（62px 时「100.0%」「160.00」会折行）。

## 流水容量（`2023c1b`）
`core/history.js`：`gameBytes` 按 UTF-8 字节 + `trimHistory(list,maxBytes)`；`HISTORY_MAX_BYTES=600KB`（≈2000 局，压在 gist `SNAPSHOT_SIZE_WARN=900KB` 下），从新往旧装，最新一局永不裁。
- ⚠️ 老写法 `slice(0,200)` 静默算错账（第 201 局起赛季积分/纪录/勋章少算）。任何「限条数」不许再现，只能限体积；`dropped>0` 必须告诉用户（`notifyHistoryTrim`）。
- 云端恢复/本地导入同样过 `trimHistory`；导入前按 `time` 倒序排。
- ⚠️ `HistoryPanel` 必须分页（20 局 + 加载更早 20 局）：折叠态也会渲染 table，几千局卡死手机。

## 落盘返回值
`savePlayers/saveHistory/saveCards/saveSettings/saveDaily/saveCloud` 都返回 boolean，调用方必须接：结算、改名、删玩家、删局、清空流水、导入、云端恢复、底注、保存 token、新玩家入库、解除归属。
- 失败 → `$message.error` 说明「刷新后会退回/复原」，**不要**再提示已保存。例外：`resetSeat` 名册存不下照样开局，只报警告。

## 云同步
本人场景：**单机记账**，一台电脑，只要防丢+换设备取回，不要多人实时 → **Gist 冷备份是唯一路径**。Deno 实时同步**已彻底删除**（`df5e501` 去 UI / `2231319` 去代码），别再加班回来。
- `core/sync.js` 纯函数 + `utils/gist.js` 唯一发请求（15s 超时，状态码转中文）。`poker:cloud`：token/gistId/lastSyncAt/autoBackup/syncedUpdatedAt。
- ⚠️ 换设备关键 `findGistId()`：gistId 只存首台电脑 → 按文件名 `texas-poker-backup.json` 认领（多份取最新）；上传/恢复/启动检查三处都先认领。
- ⚠️ 安全闸 `guardBeforeUpload`：本机 `syncedUpdatedAt=0` 而云端有档 = 新设备，自动备份**一律不覆盖**，手动上传也要弹确认（本项目最易出事的一步）。
- `checkCloudOnStart()` 开机比对云端；本地改动 `onLocalChange` 3 秒防抖自动备份；自动备份失败弹 warning；`daily` 不进云。
- ⚠️ 必须 classic token：`github_pat_` 无 gist 权限，`isFineGrainedToken()` 保存时拦下。PAT 只勾 gists，别让用户把 token 发给 AI。
- 换 token 走「更换 token」(`cloudTokenEditing`)，保存时清 `gistId` 重新认领（换账号=换网盘）。
- 三个动作别混（`2af660a`）：`断开连接`=只断本机；`清空云端存档`=`deleteGist()` 真删（本机数据不动、token 留、清 gistId/lastSyncAt，`syncedUpdatedAt` **故意保留**否则下次上传误判新设备）；`清空流水`=本机归零（走 rebuild）。
- ⚠️ `request()` 必须处理 **204**（DELETE 无响应体，硬 `json()` 抛 SyntaxError）；`deleteGist` 404 视为「本来就没有」。
- ⚠️ 确认框 `confirmButtonClass:"el-button--danger"` 会被主题 primary 渐变盖掉，theme.css 单独压红，别删。

## PWA（`34e1e5d`/`7c0f732`/`a698f4f`）
`public/manifest.json`（`start_url "./"`、standalone、192/512/maskable）+ `index.html` 的 manifest/theme-color/apple-touch-icon/iOS meta。**不加 Service Worker**（要给最新账，缓存会给旧数）。
- 图标源脚本 `.workbuddy/scripts/make-pwa-icons.py`（纯 Python 写 PNG/ICO，零依赖）→ 输出 `public/`；改图形调 `SPADE_PATH`/`graphic_scale` 重跑，别手工 P 图覆盖。
- ⚠️ `favicon.ico` 也由它的 `write_ico()` 生成（16/32/48，scale 0.76）；改完必须 bump index.html 的 `?v=`（favicon 缓存极顽固）。
- ⚠️ 黑桃只能用贝塞尔轮廓（10 段 M/C：尖顶→外扩翼→缓弧翼底→内凹收腰→外扩梗→镜像）；「三角+两圆」在 48px 像梅花；梗两侧控制点 x 必须单调内收（否则谷底鼓尖包）；横向压 0.78。
- 配色 `PALETTES`（navy-gold/ivory-navy/crimson-ivory），`--compare` 出对比图；金色只做竖直渐变+很弱左上受光（右下背光出脏暗斑）；`preview()` 512→32，小尺寸才是真实观感。
- ⚠️ `apple-mobile-web-app-status-bar-style` 用 `black`；manifest 与图标路径必须相对。iOS 先截图再存图标 → 改完要删旧桌面图标重加。

## 已否决（别再翻出来）
- ❌ 拆 `GameDetail.vue`（3800 行）：风险在结算主路径，收益只是好看。
- ❌ 把 `.workbuddy/scripts/` 的 7 个一次性脚本搬进 `scripts/`：纯搬家，零收益。
- ❌ 恢复 Deno / 实时同步（单机记账，免费层长连接烧穿额度）。
