<template>
  <div class="detail">
    <!-- 品牌区：深色绒布 + 金色牌花，给整页定个调子；右侧是随时要看的三个数 -->
    <header class="hero">
      <div class="hero__brand">
        <span class="hero__mark" aria-hidden="true">♠</span>
        <div class="hero__titles">
          <h1 class="hero__title">德州扑克结算</h1>
          <p class="hero__sub">记分 · 分账 · 段位 · 勋章</p>
        </div>
      </div>
      <div class="hero__stats">
        <div class="hero__stat">
          <span class="hero__stat-k">在场</span>
          <span class="hero__stat-v">{{ playersSort.length }}</span>
          <span class="hero__stat-u">人</span>
        </div>
        <span class="hero__stat-sep"></span>
        <div class="hero__stat">
          <span class="hero__stat-k">底注</span>
          <span class="hero__stat-v">{{ format(baseChips) }}</span>
        </div>
        <span class="hero__stat-sep"></span>
        <div class="hero__stat">
          <span class="hero__stat-k">今日</span>
          <span class="hero__stat-v">{{ todayGames }}</span>
          <span class="hero__stat-u">局</span>
        </div>
      </div>
    </header>

    <!-- 操作条：左边只管「开一局」，右边全是工具，用分隔线分成数据 / 收藏 / 管理三组 -->
    <div class="toolbar">
      <div class="toolbar__main">
        <el-button
          class="btn-start"
          type="primary"
          :disabled="isPlaying"
          :icon="isPlaying ? 'el-icon-basketball' : 'el-icon-guide'"
          @click="resetSeat"
          >{{ isPlaying ? "进行中" : "开局选座" }}</el-button
        >
        <el-select
          v-model="selectPlayers"
          class="select-players"
          multiple
          filterable
          allow-create
          default-first-option
          :disabled="isPlaying"
          placeholder="请选择或添加玩家"
        >
          <template slot="empty">
            <span class="select-players__empty">
              名册还是空的 —— 直接在输入框里敲名字回车，新玩家会自动入库
            </span>
          </template>
          <el-option
            v-for="item in playerOptions"
            :key="item"
            :label="item"
            :value="item"
            :disabled="isOptionDisabled(item)"
          >
            <span class="option-name">
              <player-avatar
                :name="item"
                :avatar="avatarOf(item)"
                :size="20"
              />
              <span>{{ item }}</span>
            </span>
            <span v-if="parentNameOf(item)" class="option-parent">{{
              parentNameOf(item)
            }}</span>
          </el-option>
        </el-select>
        <el-button
          v-if="isPlaying"
          type="danger"
          plain
          icon="el-icon-refresh-left"
          @click="cancelGame"
          >放弃本局</el-button
        >
      </div>

      <div class="toolbar__tools">
        <button type="button" class="tool tool--gold" @click="openDailyPodium">
          <i class="el-icon-trophy"></i><span>今日结算</span>
        </button>
        <span class="toolbar__divider"></span>
        <button type="button" class="tool" @click="openModule('dashboard')">
          <i class="el-icon-pie-chart"></i><span>数据看板</span>
        </button>
        <button type="button" class="tool" @click="openModule('records')">
          <i class="el-icon-s-flag"></i><span>记录榜</span>
        </button>
        <button type="button" class="tool" @click="openModule('season')">
          <i class="el-icon-s-data"></i><span>赛季榜</span>
        </button>
        <button type="button" class="tool" @click="openModule('rank')">
          <i class="el-icon-data-analysis"></i><span>总榜</span>
        </button>
        <button type="button" class="tool" @click="openModule('history')">
          <i class="el-icon-time"></i><span>流水</span>
        </button>
        <span class="toolbar__divider"></span>
        <button type="button" class="tool" @click="openModule('medals')">
          <i class="el-icon-medal-1"></i><span>勋章墙</span>
        </button>
        <button type="button" class="tool" @click="openModule('cards')">
          <i class="el-icon-present"></i><span>卡牌</span>
        </button>
        <span class="toolbar__divider"></span>
        <button type="button" class="tool" @click="playerManagerVisible = true">
          <i class="el-icon-user"></i><span>玩家管理</span>
        </button>
        <button type="button" class="tool" @click="openSettings">
          <i class="el-icon-setting"></i><span>设置</span>
        </button>
      </div>
    </div>

    <div class="content" v-if="players.length !== 0">
      <el-row :gutter="20">
        <el-col :span="13">
          <el-card shadow="never">
            <div slot="header" class="card-header">
              <span class="card-header__title">
                <i class="el-icon-s-grid"></i>
                本局座位
              </span>
              <span class="card-header__hint"
                >底注 {{ format(baseChips) }} / 人 · 点「计算器」数筹码</span
              >
            </div>

            <div v-if="!playersSort.length" class="seat-empty">
              <i class="el-icon-guide"></i>
              <p class="seat-empty__title">还没有开局</p>
              <span class="seat-empty__hint"
                >在上方选好玩家，点「开局选座」开始记分</span
              >
            </div>
            <!-- 窄屏：表格 6 列最少 616px，塞进 375 只能靠横向滚动，
                 所以整块换成卡片列表 —— 座位号、头像、段位、盈亏、筹码录入、计算器
                 都还在，只是改成两行竖向排，不用左右拖 -->
            <ul v-else-if="isCompact" class="seat-list">
              <li v-for="row in playersSort" :key="row.name" class="seat-row">
                <span class="seat-row__no">{{ row.seatNum }}</span>
                <div class="seat-row__body">
                  <div class="seat-row__head">
                    <player-avatar
                      :name="row.name"
                      :avatar="avatarOf(row.name)"
                      :size="28"
                      @click.native="openAvatarPicker(row.name)"
                    />
                    <b class="seat-row__name">{{ row.name }}</b>
                    <el-tooltip
                      :content="tierTipOf(row.name)"
                      placement="top"
                    >
                      <span class="tier" :class="tierClassOf(row.name)">{{
                        tierLabelOf(row.name)
                      }}</span>
                    </el-tooltip>
                    <span
                      class="seat-row__delta"
                      :class="deltaClass(deltaOf(row))"
                      >{{ formatSigned(deltaOf(row)) }}</span
                    >
                  </div>
                  <div class="seat-row__foot">
                    <el-input
                      v-model="row.chips"
                      size="mini"
                      placeholder="剩余筹码"
                      @input="onChipsInput(row)"
                    ></el-input>
                    <el-button
                      class="chip-calc-btn"
                      size="mini"
                      type="primary"
                      plain
                      icon="el-icon-coin"
                      @click="openChipCalc(row)"
                      >计算器</el-button
                    >
                  </div>
                </div>
              </li>
            </ul>
            <el-table
              v-else
              :data="playersSort"
              row-key="name"
              stripe
              style="width: 100%"
            >
              <el-table-column prop="seatNum" label="座位" width="58" align="center" />
              <el-table-column label="玩家" min-width="168">
                <template slot-scope="scope">
                  <span class="cell-name">
                    <player-avatar
                      class="cell-avatar"
                      :name="scope.row.name"
                      :avatar="avatarOf(scope.row.name)"
                      :size="26"
                      @click.native="openAvatarPicker(scope.row.name)"
                    />
                    <span>{{ scope.row.name }}</span>
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="段位" width="88" align="center">
                <template slot-scope="scope">
                  <el-tooltip
                    :content="tierTipOf(scope.row.name)"
                    placement="top"
                  >
                    <span class="tier" :class="tierClassOf(scope.row.name)">{{
                      tierLabelOf(scope.row.name)
                    }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="剩余筹码" min-width="118">
                <template slot-scope="scope">
                  <el-input
                    v-model="scope.row.chips"
                    size="mini"
                    placeholder="剩余筹码"
                    @input="onChipsInput(scope.row)"
                  ></el-input>
                </template>
              </el-table-column>
              <el-table-column label="盈亏" width="76">
                <template slot-scope="scope">
                  <span :class="deltaClass(deltaOf(scope.row))">{{
                    formatSigned(deltaOf(scope.row))
                  }}</span>
                </template>
              </el-table-column>
              <el-table-column
                label="筹码"
                width="108"
                align="center"
                fixed="right"
                class-name="chip-col"
              >
                <template slot-scope="scope">
                  <el-button
                    class="chip-calc-btn"
                    size="mini"
                    type="primary"
                    plain
                    icon="el-icon-coin"
                    @click="openChipCalc(scope.row)"
                    >计算器</el-button
                  >
                </template>
              </el-table-column>
            </el-table>

            <div
              v-if="playersSort.length"
              class="balance"
              :class="balanced ? 'is-ok' : 'is-bad'"
            >
              <span class="balance__label">平账校验</span>
              <span :class="['balance__value', balanced ? 'is-ok' : 'is-bad']">
                总投入 {{ format(totalBuyIn) }} / 已录入
                {{ format(totalChips) }}
                <template v-if="!balanced && playersSort.length">
                  （{{ balanceDiff > 0 ? "多" : "少" }}
                  {{ format(Math.abs(balanceDiff)) }}）
                </template>
              </span>
            </div>

            <div v-if="playersSort.length" class="account-button">
              <el-button
                type="primary"
                round
                :disabled="settling || !playersSort.length"
                @click="settleAccount"
                >结算本局</el-button
              >
              <el-switch
                v-model="humaneModel"
                active-text="人道模式结算"
                class="humane-model"
              >
              </el-switch>
            </div>
          </el-card>
        </el-col>

        <el-col :span="11">
          <el-card shadow="never">
            <div slot="header" class="card-header card-header--rank">
              <span class="card-header__title">
                <i class="el-icon-trophy"></i>
                今日排行榜
              </span>
              <span class="card-header__hint">按今天上桌的号排名</span>
            </div>
            <div class="rank-wrap">
              <rank-table
                :data="todayRanking"
                :show-expand="false"
                :compact="isCompact"
              />
              <div class="rank-foot">
                <span>今日已结算 {{ todayGames }} 局</span>
                <span class="rank-foot__hint">只统计今天上桌的号</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-else class="empty-tip">
      <span class="empty-tip__mark" aria-hidden="true">♠</span>
      <p class="empty-tip__title">牌桌还没支起来</p>
      <span class="empty-tip__hint"
        >在上方选择玩家（也可以直接输入新名字），然后点「开局选座」</span
      >
    </div>

    <!-- 本局结算明细 -->
    <el-drawer
      :visible.sync="drawer"
      direction="rtl"
      :size="drawerSize"
      custom-class="result-drawer"
      :with-header="false"
      :before-close="handleClose"
    >
      <div class="result">
        <!-- 头图 + 赢家卡固定在上方：负 margin 压边必须在滚动区外，否则会被裁掉 -->
        <div class="result__top">
          <header class="result__hero">
            <span class="result__glow result__glow--a"></span>
            <span class="result__glow result__glow--b"></span>
            <button class="result__close" title="关闭" @click="closeDrawer">
              <i class="el-icon-close"></i>
            </button>
            <p class="result__eyebrow">ROUND SETTLED</p>
            <h2 class="result__title">本局结算</h2>
            <p class="result__meta">
              {{ records.length }} 人上桌 · 底注 ¥{{ format(baseChips) }}
              <template v-if="transfers.length">
                · {{ transfers.length }} 笔转账
              </template>
            </p>
          </header>

          <!-- 最大赢家：唯一正数里赢得最多的那位 -->
          <div v-if="resultChampion" class="champion">
            <span class="champion__crown"><i class="el-icon-trophy"></i></span>
            <player-avatar
              :name="resultChampion.name"
              :avatar="avatarOf(resultChampion.name)"
              :size="48"
            />
            <div class="champion__info">
              <span class="champion__tag">本局最大赢家</span>
              <b class="champion__name">{{ resultChampion.name }}</b>
            </div>
            <span class="champion__amount">{{
              formatSigned(resultChampion.delta)
            }}</span>
          </div>
        </div>

        <div class="result__scroll">
          <!-- 盈亏榜：中线为零点，红条向右赢、绿条向左亏 -->
          <section v-if="resultsSorted.length" class="board">
            <div class="section-head">
              <span class="section-head__title">
                <i class="el-icon-data-line"></i>盈亏明细
              </span>
              <span class="section-head__hint">按盈亏从高到低</span>
            </div>
            <ul class="board__list">
              <li
                v-for="(row, index) in resultsSorted"
                :key="row.name"
                class="board__row"
                :class="{
                  'is-winner': row.delta > 0,
                  'is-champion': index === 0 && row.delta > 0,
                  'is-zero': !row.delta,
                }"
              >
                <player-avatar
                  :name="row.name"
                  :avatar="avatarOf(row.name)"
                  :size="30"
                />
                <span class="board__name">{{ row.name }}</span>
                <span class="board__bar">
                  <i class="board__axis"></i>
                  <i
                    class="board__fill"
                    :class="row.delta > 0 ? 'is-win' : 'is-lose'"
                    :style="{ width: barWidth(row) + '%' }"
                  ></i>
                </span>
                <span class="board__delta" :class="deltaClass(row.delta)">{{
                  formatSigned(row.delta)
                }}</span>
              </li>
            </ul>
          </section>

          <!-- 转账方案 -->
          <section v-if="transfers.length" class="transfers">
            <div class="section-head">
              <span class="section-head__title">
                <i class="el-icon-sort"></i>转账方案
              </span>
              <span class="section-head__hint">照着转就行</span>
            </div>
            <div
              v-for="(item, index) in transfers"
              :key="index"
              class="transfer"
            >
              <span class="transfer__side is-out">
                <player-avatar
                  :name="item.from"
                  :avatar="avatarOf(item.from)"
                  :size="22"
                />
                <b>{{ item.from }}</b>
              </span>
              <span class="transfer__rail">
                <i class="transfer__dot"></i>
                <i class="transfer__line"></i>
                <i class="el-icon-right transfer__arrow"></i>
              </span>
              <span class="transfer__side is-in">
                <player-avatar
                  :name="item.to"
                  :avatar="avatarOf(item.to)"
                  :size="22"
                />
                <b>{{ item.to }}</b>
              </span>
              <span class="transfer__amount">{{ format(item.amount) }}</span>
            </div>
          </section>

          <div v-else class="result__empty">
            <i class="el-icon-success"></i>这局没人需要转账
          </div>

          <!-- 本局奖券 -->
          <section v-if="lastGrants.length" class="tickets">
            <div class="tickets__head">
              <span class="tickets__title">
                <i class="el-icon-present"></i>本局奖券
              </span>
              <el-button
                size="mini"
                class="tickets__btn"
                icon="el-icon-present"
                @click="openCardDrawer"
                >去抽卡</el-button
              >
            </div>
            <div
              v-for="item in lastGrants"
              :key="item.name"
              class="result__tickets-row"
            >
              <span class="ticket-name">{{ item.name }}</span>
              <span class="ticket-count">+{{ item.tickets }}</span>
              <span class="ticket-reasons">
                <span class="ticket-reasons-line">{{
                  item.reasons.map((r) => r.label).join(" · ")
                }}</span>
                <span
                  v-for="(line, index) in ticketDetails(item)"
                  :key="index"
                  class="ticket-detail"
                >
                  <b class="ticket-detail__label">{{ line.label }}：</b>
                  <span class="ticket-detail__text">{{ line.text }}</span>
                </span>
              </span>
            </div>
          </section>
        </div>

        <div class="result__footer">
          <div class="result__actions">
            <el-button
              v-if="transfers.length"
              plain
              icon="el-icon-document-copy"
              @click="copyTransfers"
              >复制转账方案</el-button
            >
            <el-button
              type="primary"
              icon="el-icon-refresh-right"
              @click="playAgain"
              >再来一局</el-button
            >
            <el-button @click="closeDrawer">关闭</el-button>
          </div>
          <div class="result__actions-tip">
            再来一局会沿用原班人马，重新随机分座、筹码归零
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 今日结算：领奖台 + 冠军免费抽卡 -->
    <daily-podium
      :visible.sync="podiumVisible"
      :ranking="todayRanking"
      :players="allPlayers"
      :state="cardState"
      :claimed="dailyClaimed"
      @update="handleCardsUpdate"
      @claim="markDailyClaim"
    />

    <!-- 模块中心：看板 / 记录榜 / 赛季榜 / 总榜 / 流水 / 勋章墙 / 卡牌 共用一层全屏容器 -->
    <module-stage
      :visible.sync="stageVisible"
      :module="stageModule"
      :history="history"
      :players="allPlayers"
      :ranking="totalRanking"
      :card-state="cardState"
      :card-owner="cardOwner"
      @update-cards="handleCardsUpdate"
      @update-owner="cardOwner = $event"
      @remove-game="removeHistoryGame"
      @clear-history="clearHistory"
    />

    <!-- 玩家管理 -->
    <player-manager
      :visible.sync="playerManagerVisible"
      :players="totalRanking"
      @add-main="handleAddMain"
      @add-sub="handleAddSub"
      @detach="handleDetach"
      @rename="handleRename"
      @remove="handleRemovePlayer"
      @edit-avatar="openAvatarPicker"
      @wipe="handleWipeData"
    />

    <!-- 头像选择器 -->
    <avatar-picker
      :visible.sync="avatarPickerVisible"
      :player="avatarTarget"
      :card-state="cardState"
      @change="handleAvatarChange"
    />

    <!-- 设置 -->
    <el-dialog
      title="设置"
      :visible.sync="settingsVisible"
      :width="isMobile ? '92%' : '480px'"
    >
      <!-- 窄屏 label 放到顶部：110px 的左侧 label 会吃掉小半屏，输入框只剩一条缝 -->
      <el-form
        :label-width="isMobile ? 'auto' : '110px'"
        :label-position="isMobile ? 'top' : 'right'"
      >
        <el-form-item label="每人底注筹码">
          <el-input-number
            v-model="settingsForm.baseChips"
            :min="0.01"
            :step="1"
            :precision="2"
          ></el-input-number>
          <div class="form-tip">开局时自动填入的初始筹码，可随时修改</div>
        </el-form-item>
        <el-form-item label="数据备份">
          <div class="backup-actions">
            <el-button size="small" icon="el-icon-download" @click="handleExportJson"
              >导出 JSON</el-button
            >
            <el-button size="small" icon="el-icon-tickets" @click="handleExportCsv"
              >导出 CSV</el-button
            >
            <el-upload
              class="upload-inline"
              :auto-upload="false"
              :show-file-list="false"
              accept=".json,application/json"
              :on-change="handleImportFile"
            >
              <el-button size="small" icon="el-icon-upload2">导入备份</el-button>
            </el-upload>
          </div>
          <div class="form-tip">
            数据只存在本机浏览器中，清理缓存会丢失，建议定期导出备份
          </div>
        </el-form-item>

        <el-form-item label="云备份">
          <!-- 一张浅蓝卡片收住「状态 / 上次备份 / 动作 / 断开」，别把按钮和说明摊成一堆灰字 -->
          <div class="cloud-card" :class="{ 'is-off': !cloud || !cloud.token || cloudTokenEditing }">
            <template v-if="cloud && cloud.token && !cloudTokenEditing">
              <div class="cloud-head">
                <i class="cloud-dot"></i>
                <span class="cloud-title">{{
                  cloud.gistId ? "已连接到云端" : "等待首次备份"
                }}</span>
                <span class="cloud-meta">
                  {{ cloud.lastSyncAt ? formatCloudTime(cloud.lastSyncAt) : "尚未备份" }}
                </span>
              </div>
              <div class="cloud-btns">
                <el-button size="small" type="primary" :loading="cloudBusy" @click="handleBackupNow"
                  >立即备份</el-button
                >
                <el-button
                  size="small"
                  :disabled="cloudBusy"
                  @click="handleRestoreFromCloud"
                  >从云端恢复</el-button
                >
                <el-button size="small" @click="startEditCloudToken">更换 token</el-button>
              </div>
              <div class="cloud-foot">
                <el-link class="cloud-unlink" :underline="false" @click="handleDisconnectCloud"
                  >断开连接</el-link
                >
                <span class="cloud-foot__dot">·</span>
                <el-link
                  class="cloud-unlink is-danger"
                  :underline="false"
                  :disabled="cloudBusy"
                  @click="handleClearCloud"
                  >清空云端存档</el-link
                >
                <span class="cloud-foot__hint">本机数据不动</span>
              </div>
            </template>

            <template v-else>
              <div class="cloud-head">
                <i class="cloud-dot is-off"></i>
                <span class="cloud-title">{{
                  cloudTokenEditing ? "更换 token" : "还没开启云备份"
                }}</span>
              </div>
              <el-input
                v-model="cloudForm.token"
                class="cloud-input"
                size="small"
                type="password"
                show-password
                placeholder="粘贴 classic token（ghp_ 开头）"
              ></el-input>
              <div class="cloud-btns" :class="{ 'is-pair': cloudTokenEditing }">
                <el-button size="small" type="primary" @click="handleSaveCloudToken"
                  >保存 token</el-button
                >
                <el-button v-if="cloudTokenEditing" size="small" @click="cancelEditCloudToken"
                  >取消</el-button
                >
              </div>
              <div v-if="cloudTokenEditing" class="cloud-foot">
                <span class="cloud-foot__hint">
                  同一 GitHub 账号换 token 会自动接回原存档；换成别的账号 = 换了个网盘
                </span>
              </div>
            </template>
          </div>

          <div class="cloud-tips">
            <p class="form-tip">
              存档存 GitHub Gist，免费不会清空。换电脑填同一个 token 即可恢复，本机改动 3 秒后
              自动备份。
            </p>
            <el-link class="cloud-more" type="info" :underline="false" @click="showTokenHelp = !showTokenHelp">
              {{ showTokenHelp ? "收起生成步骤" : "token 怎么生成？" }}
            </el-link>
            <div v-if="showTokenHelp" class="cloud-help">
              <p>1 · 头像 → Settings → Developer settings → Personal access tokens → <b>Tokens (classic)</b></p>
              <p>2 · Expiration 选 <b>No expiration</b>，Scopes 只勾 <b>gist</b>，别的都别勾</p>
              <p>3 · Generate 后立刻复制（关掉就看不到了），粘到上面保存</p>
              <p class="cloud-help__warn">
                细粒度 token（github_pat_ 开头）没有 Gist 权限，填了会一直同步不了
              </p>
            </div>
          </div>

        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveSettings">保存</el-button>
      </div>
    </el-dialog>

    <!-- 筹码计算器：数实物筹码个数，自动算剩余筹码 -->
    <el-dialog
      :visible.sync="chipCalcVisible"
      :title="chipCalcTitle"
      :width="isMobile ? '92%' : '420px'"
      append-to-body
      custom-class="chip-calc-dialog"
      :before-close="handleChipCalcClose"
    >
      <div v-if="chipCalcRow" class="chip-calc">
        <div class="chip-calc__hint">
          数各类实物筹码的个数，下方的「剩余筹码」会自动更新
        </div>
        <div class="chip-calc__grid">
          <div
            v-for="denom in chipDenominations"
            :key="denom.key"
            class="chip-calc__item"
          >
            <span class="chip-calc__label">{{ denom.label }}</span>
            <el-input
              v-model="chipCalcRow.chipCounts[denom.key]"
              size="mini"
              class="chip-calc__input"
              @input="onChipCountInput(chipCalcRow)"
            ></el-input>
            <span class="chip-calc__unit">× {{ denom.chips }} =</span>
            <span class="chip-calc__amount">{{
              format(amountOf(chipCalcRow.chipCounts[denom.key], denom.chips))
            }}</span>
          </div>
        </div>
        <div class="chip-calc__total">
          合计
          <b>{{ format(chipsFromCounts(chipCalcRow.chipCounts)) }}</b>
          筹码
        </div>
      </div>
      <div slot="footer">
        <el-button size="small" @click="clearChipCounts">清零</el-button>
        <el-button @click="cancelChipCalc">取消</el-button>
        <el-button type="primary" @click="confirmChipCalc">确定</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { createPlayer } from "../core/Player";
import { settleGame, formatTransfers } from "../core/settlement";
import {
  applyOutcome,
  ensurePlayers,
  buildMainRanking,
  buildTodayRanking,
  selectableNames,
  canSit,
  mainOf,
  limitOnePerMain,
  rebuildPlayersFromHistory,
} from "../core/ranking";
import {
  loadPlayers,
  savePlayers,
  loadHistory,
  saveHistory,
  loadSettings,
  saveSettings,
  loadCards,
  saveCards,
  loadCloud,
  saveCloud,
  clearCloud,
  migrate,
  STORAGE_KEYS,
  todayKey,
  onLocalChange,
  muteLocalChange,
} from "../core/storage";
import { buildSnapshot, parseSnapshot, isSnapshotTooBig } from "../core/sync";
import {
  createGist,
  updateGist,
  fetchGist,
  deleteGist,
  findGistId,
  isFineGrainedToken,
} from "../utils/gist";
import { buildAchievements } from "../core/achievements";
import { buildNewRecords } from "../core/records";
import { tierLabel, tierTone, tierTip } from "../core/tier";
import { buildSeasonScores, currentSeason } from "../core/season";
import {
  grantTickets,
  addTickets,
  renameCards as renameCardState,
  removeCards as removeCardState,
} from "../core/cards";
import { loadDaily, saveDaily } from "../core/storage";
import { trimHistory, HISTORY_MAX_BYTES } from "../core/history";
import { exportJson, exportCsv, parseBackup, applyBackup } from "../core/backup";
import { copyText } from "../core/clipboard";
import {
  format,
  formatSigned,
  sanitizeAmountInput,
  toCents,
  fromCents,
} from "../core/money";
import {
  CHIP_DENOMINATIONS,
  amountOf,
  chipsFromCounts,
  countsFromChips,
  emptyCounts,
} from "../core/chips";
import responsive from "../mixins/responsive";
import PlayerManager from "./PlayerManager.vue";
import RankTable from "./RankTable.vue";
import ModuleStage from "./ModuleStage.vue";
import DailyPodium from "./DailyPodium.vue";
import PlayerAvatar from "./PlayerAvatar.vue";
import AvatarPicker from "./AvatarPicker.vue";

export default {
  name: "GameDetail",
  mixins: [responsive],
  components: {
    PlayerManager,
    RankTable,
    ModuleStage,
    DailyPodium,
    PlayerAvatar,
    AvatarPicker,
  },
  data() {
    return {
      selectPlayers: [],
      playerOptions: [],
      players: [], // 今日排行榜
      playersSort: [], // 本局在座
      allPlayers: [], // 总排行榜
      history: [],
      chipDenominations: CHIP_DENOMINATIONS,
      chipCalcVisible: false, // 筹码计算器弹窗
      chipCalcName: "", // 正在给谁算
      chipCalcSnapshot: null, // 打开计算器那一刻的筹码，取消时还原
      settings: { baseChips: 10 },
      settingsForm: { baseChips: 10 },
      drawer: false,
      records: [],
      transfers: [],
      humaneModel: false,
      isPlaying: false,
      settling: false,
      cardState: null, // 卡牌存档（奖券 / 卡包 / 保底 / 碎片）
      lastGrants: [], // 本局发放的奖券明细，结算抽屉展示
      historyTrimNotified: false, // 流水超出体积预算的提示，一次会话只说一次
      stageVisible: false, // 模块中心（全屏）
      stageModule: "dashboard", // 这次要落在哪个模块
      // 卡牌收藏里正在看谁的卡包。模块中心切模块会销毁重建，
      // 存在父组件里才能让「切走再切回来」停在同一个人身上
      cardOwner: "",
      playerManagerVisible: false,
      settingsVisible: false,
      podiumVisible: false, // 今日结算领奖台
      daily: null, // 今日结算领奖状态：哪天、谁领过免费抽卡
      avatarPickerVisible: false, // 头像选择器
      avatarPickerName: "", // 正在给谁换头像
      cloud: null, // 云备份配置（token / gistId / 上次同步），只在本机
      cloudBusy: false, // 正在上传或下载，防重复点击
      cloudBackupTimer: null, // 本地改动后的防抖备份定时器，非响应式
      cloudForm: { token: "" }, // 设置弹窗里的 token 输入框
      cloudTokenEditing: false, // 已有 token 时点「更换 token」才展开输入框
      showTokenHelp: false, // 「token 怎么生成」三步说明，默认收起
    };
  },
  computed: {
    /** 结算抽屉：窄屏占满整屏（半屏 45% 在手机上连名字都放不下） */
    drawerSize() {
      return this.isMobile ? "100%" : "45%";
    },
    baseChips() {
      return this.settings.baseChips;
    },
    /** 结算抽屉的盈亏榜：按盈亏从高到低，并列时用码点序兜底（localeCompare 会抖） */
    resultsSorted() {
      return (this.records || [])
        .slice()
        .sort((a, b) => {
          const diff = toCents(b.delta) - toCents(a.delta);
          if (diff !== 0) return diff;
          const x = String(a.name);
          const y = String(b.name);
          return x < y ? -1 : x > y ? 1 : 0;
        });
    },
    /** 本局最大赢家：没有正盈亏就不摆这个位子，免得出现「最大赢家 0.00」 */
    resultChampion() {
      const top = this.resultsSorted[0];
      return top && toCents(top.delta) > 0 ? top : null;
    },
    /** 盈亏条归一化基准：全场绝对值最大的那一笔 */
    resultMaxAbs() {
      return (
        this.resultsSorted.reduce(
          (max, row) => Math.max(max, Math.abs(toCents(row.delta))),
          0
        ) || 1
      );
    },
    /** 今天已结算几局（顶栏那三个数之一） */
    todayGames() {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const d = now.getDate();
      return this.history.filter((game) => {
        const t = new Date(game.time);
        return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
      }).length;
    },
    /** 弹窗里正在操作的这一位，按名字找行，避免拿到过期引用 */
    chipCalcRow() {
      if (!this.chipCalcName) return null;
      return (
        this.playersSort.find((row) => row.name === this.chipCalcName) || null
      );
    },
    chipCalcTitle() {
      return this.chipCalcRow
        ? `筹码计算器 · ${this.chipCalcRow.name}（座位 ${this.chipCalcRow.seatNum}）`
        : "筹码计算器";
    },
    /** 今日榜：只排今天真正上桌的号（子账号 / 独立号），不做主账号归集 */
    todayRanking() {
      return buildTodayRanking(this.players, this.allPlayers);
    },
    /** 头像选择器编辑的目标账号（用 computed 查，保证拿到的是最新对象） */
    avatarTarget() {
      if (!this.avatarPickerName) return null;
      return (
        this.allPlayers.find((item) => item.name === this.avatarPickerName) || null
      );
    },
    /** 今日冠军奖励是否已领（跨天自动作废） */
    dailyClaimed() {
      return !!(this.daily && this.daily.claimed);
    },
    /** 总榜：同上 */
    totalRanking() {
      return buildMainRanking(this.allPlayers);
    },
    /** 当前赛季各主账号的积分（段位专用），没上过桌的账号不在这个表里 */
    seasonScores() {
      return buildSeasonScores(this.history, this.allPlayers);
    },
    /** 「2026 秋」这类赛季名，给段位悬浮提示用 */
    seasonLabel() {
      const season = currentSeason();
      return season ? season.label : "";
    },
    totalBuyIn() {
      return fromCents(
        this.playersSort.reduce((acc, row) => acc + toCents(row.buyIn), 0)
      );
    },
    totalChips() {
      return fromCents(
        this.playersSort.reduce((acc, row) => acc + toCents(row.chips), 0)
      );
    },
    balanceDiff() {
      return fromCents(toCents(this.totalChips) - toCents(this.totalBuyIn));
    },
    balanced() {
      return (
        this.playersSort.length > 0 &&
        toCents(this.totalChips) === toCents(this.totalBuyIn)
      );
    },
  },
  watch: {
    /**
     * 三个职责：
     * 1. 名下挂着子账号的主账号不能上桌（只做汇总），选上了也要踢掉 ——
     *    下拉框 allow-create 允许手敲名字，光靠选项列表拦不住；
     * 2. 同一个主账号下只能留一个号在座，后选的顶掉先选的；
     * 3. 下拉框支持 allow-create，用户随手写的新昵称要立刻进玩家库，
     *    否则只有点「开局选座」那一刻才会写入，中途刷新就丢了。
     */
    selectPlayers(value) {
      const names = Array.isArray(value) ? value.filter(Boolean) : [];

      // 名册外的新昵称（下拉框 allow-create 现敲的）不参与判断，一律放行
      const known = (name) =>
        this.allPlayers.some((player) => player.name === name);
      const blocked = names.filter((name) => known(name) && !canSit(this.allPlayers, name));
      if (blocked.length) {
        this.selectPlayers = names.filter((name) => !blocked.includes(name));
        this.$message.warning(
          `「${blocked.join("、")}」名下挂着子账号，只负责汇总积分、不亲自上桌`
        );
        return; // 改完后会再次触发本 watch，接着走下面的流程
      }

      const limited = limitOnePerMain(this.allPlayers, names);
      if (limited.length !== names.length) {
        const dropped = names.filter((name) => !limited.includes(name));
        this.selectPlayers = limited;
        this.$message.warning(
          `同一个主账号只能上一个号，「${dropped.join("、")}」已自动取消选中`
        );
        return; // 改完后会再次触发本 watch，接着走下面的入库流程
      }

      const missing = names.filter(
        (name) => !this.allPlayers.some((player) => player.name === name)
      );
      if (!missing.length) return;

      this.allPlayers = ensurePlayers(
        this.allPlayers,
        missing,
        this.playerFactory
      );
      if (!savePlayers(this.allPlayers)) {
        this.$message.error("新玩家入库失败，可能是存储空间已满");
      }
      this.refreshPlayerOptions();
    },
  },
  created() {
    migrate();
    this.settings = loadSettings();
    this.settingsForm = { ...this.settings };
    this.allPlayers = loadPlayers();
    this.history = loadHistory();
    this.cardState = loadCards();
    this.daily = loadDaily();
    this.cloud = loadCloud();
    this.refreshPlayerOptions();
    // 任何一处本地写入都会走到这里，改名、删局、抽卡、改底注都能自动备份
    this.offLocalChange = onLocalChange(() => {
      this.scheduleCloudBackup();
    });
    // 打开页面先看一眼云端有没有更新的存档 —— 换台电脑登录就靠这一步
    this.checkCloudOnStart();
  },
  beforeDestroy() {
    this.clearCloudBackupTimer();
    if (typeof this.offLocalChange === "function") this.offLocalChange();
  },
  methods: {
    format,
    formatSigned,

    /**
     * 选人列表 = 名册里能上桌的号：独立号 + 名下还没子账号的主账号。
     * 挂着子账号的主账号由 selectableNames 直接滤掉（只做汇总、不上桌）。
     * 「同组只出一个号」由 limitOnePerMain 兜底。
     *
     * ⚠️ 列表里只有名册里真实存在的玩家 —— 不预置任何默认昵称。
     *    新玩家要么在「玩家管理」里加，要么在下拉框里直接敲名字（allow-create）。
     */
    refreshPlayerOptions() {
      this.playerOptions = Array.from(
        new Set(selectableNames(this.allPlayers))
      );

      // 顺手清理已选名单：同一个主账号（含它自己）只留一个号。
      // 还没入库的新昵称（下拉框里刚敲的）一律放行。
      const allowed = new Set(this.playerOptions);
      const next = limitOnePerMain(
        this.allPlayers,
        this.selectPlayers.filter(
          (name) =>
            allowed.has(name) ||
            !this.allPlayers.some((player) => player.name === name)
        )
      );
      // 牌局进行中不动已选名单，避免与桌上的座位表对不上
      if (!this.isPlaying && next.length !== this.selectPlayers.length) {
        this.selectPlayers = next;
      }
    },

    /** 该账号隶属的主账号名；自己就是主账号或还没入库时返回空串 */
    parentNameOf(name) {
      const player = this.allPlayers.find((item) => item.name === name);
      if (!player || !player.parent) return "";
      return player.parent;
    },

    /**
     * 段位按「**当前赛季**积分」算 —— 每个赛季重新定级，不是历史累计。
     *
     * 座位表里的 row 是开局时新建的临时对象，score 只记今天的分，
     * 所以必须回赛季积分表按主账号取；本赛季一场没打过的号取不到值，按 0 分算。
     */
    tierScoreOf(name) {
      const group = this.groupOf(name) || name;
      return this.seasonScores.has(group) ? this.seasonScores.get(group) : 0;
    },
    tierLabelOf(name) {
      return tierLabel(this.tierScoreOf(name));
    },
    tierClassOf(name) {
      return "tier--" + tierTone(this.tierScoreOf(name));
    },
    tierTipOf(name) {
      const group = this.groupOf(name) || name;
      const score = this.tierScoreOf(name);
      // 本赛季还没上过桌：说清楚是「没数据」而不是真的打了个平手
      if (!this.seasonScores.has(group)) {
        return `本赛季（${this.seasonLabel}）还没上过桌，暂列「${tierLabel(
          score
        )}」`;
      }
      return `本赛季（${this.seasonLabel}）${formatSigned(
        score
      )} 分｜${tierTip(score)}`;
    },

    /**
     * 座位表 / 下拉框里的行不一定是总库的玩家对象，统一按名字回总库取头像。
     * 查不到就返回空串，交给头像组件生成昵称色块。
     */
    avatarOf(name) {
      const player = this.allPlayers.find((item) => item.name === name);
      return player ? player.avatar || "" : "";
    },

    /** 打开头像选择器（玩家管理里的「头像」按钮） */
    openAvatarPicker(name) {
      this.avatarPickerName = String(name || "");
      if (!this.avatarTarget) {
        this.$message.warning("找不到这个玩家，可能已经被删掉了");
        return;
      }
      this.avatarPickerVisible = true;
    },

    /**
     * 头像换完要同时写两处：总库（持久化）和今日榜（内存态榜单）。
     * 只写总库的话，今天已经上过桌的人要刷新才看得到新头像。
     */
    handleAvatarChange({ name, avatar }) {
      const value = String(avatar || "");
      const applyTo = (list) =>
        list.map((player) =>
          player.name === name ? { ...player, avatar: value } : player
        );

      this.allPlayers = applyTo(this.allPlayers);
      this.players = applyTo(this.players);

      if (!savePlayers(this.allPlayers)) {
        this.$message.error("头像保存失败，可能是存储空间已满");
      }
    },

    /** 分组键：子账号用它所属的主账号，独立玩家用自己 */
    groupOf(name) {
      return mainOf(this.allPlayers, name);
    },

    /** 同组已经有别的号在座时，把剩下的号置灰，避免选完才发现被顶掉 */
    isOptionDisabled(name) {
      const group = this.groupOf(name);
      return this.selectPlayers.some(
        (item) => item !== name && this.groupOf(item) === group
      );
    },

    /**
     * 新建玩家的统一工厂。
     * ensurePlayers 传入的 index 已是「原人数 + 本次序号」，直接 +1 即连续座位号。
     * 归属关系从总库继承，避免今日榜里丢失主子关系。
     */
    playerFactory(index, name) {
      const known = this.allPlayers.find((player) => player.name === name);
      if (known) {
        // 归属、主账号标记、头像都从总库继承，今日榜里才不会丢
        return createPlayer(
          index + 1,
          name,
          this.baseChips,
          known.parent,
          known.isMain === true,
          known.avatar || ""
        );
      }
      // 下拉框里现敲的新名字：建为「独立号」，自己就能上桌
      return createPlayer(index + 1, name, this.baseChips, null, false);
    },

    /**
     * 新建一个主账号。
     *
     * 刚建好的主账号名下还没有子账号，等同独立号 —— **可以自己上桌**。
     * 一旦给它挂上子账号，它就升级成只做汇总的分组容器，自动退出选人列表。
     * ⚠️ 同一局里主账号和它的子账号只能出一个号（limitOnePerMain）。
     */
    handleAddMain(name) {
      const value = String(name || "").trim();
      if (!value) return;
      if (this.allPlayers.some((player) => player.name === value)) {
        this.$message.warning("已存在同名账号");
        return;
      }

      const seatNum = this.allPlayers.length + 1;
      this.allPlayers = [
        ...this.allPlayers,
        createPlayer(seatNum, value, this.baseChips, null, true),
      ];
      if (!savePlayers(this.allPlayers)) {
        this.$message.error("保存失败，可能是存储空间已满");
        return;
      }
      this.refreshPlayerOptions();
      this.$message.success(
        `主账号「${value}」已创建，现在可以自己上桌；` +
          `挂上子账号后就转为只汇总、不再下场`
      );
    },

    /**
     * 给账号挂一个子账号，其战绩会自动汇总到上级名下。
     * ⚠️ 挂完子账号后，上级就变成「只汇总、不上桌」的容器，从选人列表里退出。
     */
    handleAddSub({ mainName, subName }) {
      const name = String(subName || "").trim();
      if (!name) return;
      if (this.allPlayers.some((player) => player.name === name)) {
        this.$message.warning("已存在同名账号");
        return;
      }

      // 挂上子账号后这个号就变成汇总容器、不能再上桌了 ——
      // 它要是本来就在选人列表里，被 refreshPlayerOptions 悄悄摘掉会很突然，得说一声
      const wasSelected = this.selectPlayers.includes(mainName);
      const seatNum = this.allPlayers.length + 1;
      this.allPlayers = this.allPlayers.map((player) =>
        player.name === mainName ? { ...player, isMain: true } : player
      );
      this.allPlayers = [
        ...this.allPlayers,
        createPlayer(seatNum, name, this.baseChips, mainName),
      ];

      if (!savePlayers(this.allPlayers)) {
        this.$message.error("保存失败，可能是存储空间已满");
        return;
      }
      this.refreshPlayerOptions();
      const dropped = wasSelected && !this.selectPlayers.includes(mainName);
      this.$message.success(
        dropped
          ? `已把「${name}」挂到「${mainName}」名下，「${mainName}」转为只汇总、已退出选人列表`
          : `已把「${name}」挂到「${mainName}」名下`
      );
    },

    /** 解除归属：子账号变回独立号，战绩不再汇总给上级，自己也能上桌 */
    handleDetach(name) {
      const detach = (list) =>
        list.map((player) =>
          player.name === name
            ? { ...player, parent: null, isMain: false }
            : player
        );

      this.allPlayers = detach(this.allPlayers);
      // 今日榜里的归属标签要跟着更新，否则还挂着旧主账号的名字
      this.players = detach(this.players);
      const saved = savePlayers(this.allPlayers);
      this.refreshPlayerOptions();
      if (!saved) {
        this.$message.error("解除归属保存失败，可能是存储空间已满");
        return;
      }
      this.$message.success(`「${name}」已变回独立号，可以自己上桌了`);
    },

    /** 开局：随机分座，并为每位玩家建立本局独立记录 */
    resetSeat() {
      if (this.selectPlayers.length === 0) {
        this.$message.warning("请先选择玩家");
        return;
      }

      this.isPlaying = true;
      this.settling = false;

      // 先确保总库里有这些玩家，之后才能查到各自的归属关系
      this.allPlayers = ensurePlayers(
        this.allPlayers,
        this.selectPlayers,
        this.playerFactory
      );
      // 落盘失败也照样开局：已经录入的筹码不能因为存不下就丢掉，
      // 但必须让用户知道这一局的数据可能留不住
      if (!savePlayers(this.allPlayers)) {
        this.$message.error("玩家名册保存失败，可能是存储空间已满");
      }

      // 今日榜只记真正上桌的号，主账号不进榜（它只在总榜里做汇总）
      this.players = ensurePlayers(
        this.players,
        this.selectPlayers,
        this.playerFactory
      );

      const seats = this.shuffle(
        this.selectPlayers.map((item, index) => index + 1)
      );

      this.playersSort = this.selectPlayers.map((name, index) => ({
        seatNum: seats[index],
        name,
        chips: String(this.baseChips),
        // 按底注预先折好一份实物筹码数量，玩家只需照着实数微调
        chipCounts: countsFromChips(this.baseChips),
        buyIn: this.baseChips,
      }));
      this.playersSort.sort((a, b) => a.seatNum - b.seatNum);
    },

    /** 放弃本局：不结算、不计分 */
    cancelGame() {
      this.$confirm("放弃本局将丢弃当前录入的筹码，确认？", "提示", {
        type: "warning",
      })
        .then(() => {
          this.resetBoard();
        })
        .catch(() => {});
    },

    onChipsInput(row) {
      row.chips = sanitizeAmountInput(row.chips, 0, this.totalBuyIn);
      // 直接手输筹码时，把计算器的数量反推回去，两边不会各说各话
      row.chipCounts = countsFromChips(row.chips);
    },

    /** 打开某位玩家的筹码计算器 */
    openChipCalc(row) {
      if (!row) return;
      // 数量缺失时（老数据或手输过筹码）先反推一份，弹窗里不至于空荡
      if (!row.chipCounts) row.chipCounts = countsFromChips(row.chips);
      this.chipCalcName = row.name;
      this.chipCalcSnapshot = {
        name: row.name,
        chips: row.chips,
        counts: { ...row.chipCounts },
      };
      this.chipCalcVisible = true;
    },

    /** 弹窗里的数量全部清零，剩余筹码跟着归 0 */
    clearChipCounts() {
      if (!this.chipCalcRow) return;
      this.chipCalcRow.chipCounts = emptyCounts();
      this.chipCalcRow.chips = "0";
    },

    /** 取消：还原成打开计算器之前的样子 */
    restoreChipCounts() {
      const snapshot = this.chipCalcSnapshot;
      this.chipCalcSnapshot = null;
      if (!snapshot) return;

      const row = this.playersSort.find((item) => item.name === snapshot.name);
      if (!row) return;
      row.chips = snapshot.chips;
      row.chipCounts = { ...snapshot.counts };
    },

    cancelChipCalc() {
      this.restoreChipCounts();
      this.chipCalcVisible = false;
    },

    confirmChipCalc() {
      this.chipCalcSnapshot = null;
      this.chipCalcVisible = false;
    },

    /** 点右上角 X 或遮罩关闭时也按「取消」处理 */
    handleChipCalcClose(done) {
      this.restoreChipCounts();
      done();
    },

    /**
     * 筹码计算器：玩家填的是各类实物筹码的「个数」，
     * 每次改动就重算一遍合计，并直接写进「剩余筹码」。
     */
    onChipCountInput(row) {
      const counts = row.chipCounts || {};
      Object.keys(counts).forEach((key) => {
        // 只留数字（允许空着，空 = 0），顺手去掉 "007" 这种前导零
        counts[key] = String(counts[key] == null ? "" : counts[key])
          .replace(/[^\d]/g, "")
          .replace(/^0+(?=\d)/, "");
      });
      // 计算器算出来的必然是非负数字，不必再按输入框口径裁剪
      row.chips = String(chipsFromCounts(counts));
    },

    /** 交给模板用：某个面值若干个 → 折合多少筹码 */
    amountOf,

    /** 交给模板用：整张数量表 → 合计筹码 */
    chipsFromCounts,

    deltaOf(row) {
      return fromCents(toCents(row.chips) - toCents(row.buyIn));
    },

    deltaClass(delta) {
      const cents = toCents(delta);
      if (cents > 0) return "delta delta--win";
      if (cents < 0) return "delta delta--lose";
      return "delta";
    },

    /**
     * 盈亏条长度：一条轨道左右各占一半，零点是中线。
     * 最长的那一笔正好铺满自己那半边，所以上限 50%，最小给 2% 免得小金额看不见。
     */
    barWidth(row) {
      const abs = Math.abs(toCents(row.delta));
      // 0 盈亏要真的不留痕：宽度给 0，否则一个 2% 的小点看起来像"赢了/输了"
      if (!abs) return 0;
      return Math.max(2, Math.round((abs / this.resultMaxAbs) * 50));
    },

    settleAccount() {
      const result = settleGame(this.playersSort, this.humaneModel);

      if (!result.valid) {
        const diff = result.diff;
        this.$message.error(
          `已录入 ${format(result.actual)}，与总投入 ${format(
            result.expected
          )} 相差 ${format(Math.abs(diff))}（${
            diff > 0 ? "多" : "少"
          }），请先核对筹码`
        );
        return;
      }

      this.$confirm("结算后战绩将计入排行榜，是否继续？", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      })
        .then(() => {
          this.settling = true; // 上锁，避免重复点击重复计分
          this.records = result.records;
          this.transfers = result.transfers;
          this.applyResult(result.records);
          this.drawer = true;
        })
        .catch(() => {});
    },

    /** 把本局结果写入今日榜、总榜与流水，并按口径发放卡牌奖券 */
    applyResult(records) {
      // 发券要用到「上一局谁输光了」和「本局入账前的流水」，必须在 history 被 unshift 之前抓
      const prevRound = this.history[0] || null;
      const prevHistory = this.history;

      this.players = applyOutcome(this.players, records);
      this.allPlayers = applyOutcome(this.allPlayers, records);
      if (!savePlayers(this.allPlayers)) {
        this.$message.error("排行榜保存到本地失败，可能是存储空间已满");
      }

      const game = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        time: Date.now(),
        baseChips: this.baseChips,
        records: records.map((record) => ({
          name: record.name,
          seatNum: record.seatNum,
          chips: record.chips,
          delta: record.delta,
          result: record.result,
        })),
        transfers: this.transfers,
      };

      // 流水按体积保留（core/history.js），不再硬砍 200 局：
      // 被砍掉的局是赛季积分 / 纪录榜 / 勋章重放的输入，少了就是静默算错账。
      const appended = trimHistory([game, ...this.history]);
      this.history = appended.list;
      if (!saveHistory(this.history)) {
        this.$message.error("对局流水保存失败，可能是存储空间已满");
      }
      this.notifyHistoryTrim(appended);

      this.grantCards(game, prevRound, prevHistory);

      // 战绩、名册、卡包此时都已落盘，静默推一份到云端。
      // 这一步在结算流程最末尾，成功与否都不影响本局结果。
      this.autoBackupToCloud();
    },

    /**
     * 流水超出体积预算时明确告知用户。
     *
     * 裁剪只会砍掉最老的几局，但全期纪录 / 勋章墙是按**现存流水**重放的，
     * 少了那几局就会少算 —— 老版本 `slice(0, 200)` 最要命的就是不吭声。
     * 一次会话只提示一次：真到了这个体量，每局都弹等于噪音。
     */
    notifyHistoryTrim({ dropped, bytes, list }) {
      if (!dropped || this.historyTrimNotified) return;
      this.historyTrimNotified = true;
      const budgetKb = Math.round(HISTORY_MAX_BYTES / 1024);
      this.$message.warning(
        `对局流水已超过本机上限（约 ${budgetKb} KB），最早的 ${dropped} 局不再计入统计。` +
          `当前保留 ${list.length} 局 / ${Math.max(1, Math.round(bytes / 1024))} KB，` +
          "建议先「导出备份」留档。"
      );
    },

    /**
     * 发放本局奖券。战绩此时已经入账，发券失败不能连累它，
     * 所以整段包起来，出错只提示、不中断。
     *
     * @param {Array} prevHistory 本局入账前的流水，用来对比「刷新了哪几项纪录」
     */
    grantCards(game, prevRound, prevHistory) {
      try {
        const prevBusted = {};
        if (prevRound) {
          const stake = toCents(prevRound.baseChips);
          (prevRound.records || []).forEach((record) => {
            const busted = toCents(record.chips) <= 0 && toCents(record.delta) < 0;
            if (!busted || stake <= 0) return;
            const group = mainOf(this.allPlayers, record.name) || record.name;
            prevBusted[group] = true;
          });
        }

        const { grants } = grantTickets({
          records: game.records,
          players: this.allPlayers,
          baseChips: game.baseChips,
          prevBusted,
          newMedals: this.countNewMedals(game, prevRound),
          newRecords: this.countNewRecords(prevHistory),
        });

        this.lastGrants = grants;
        if (!grants.length) return;

        this.cardState = addTickets(this.cardState, grants);
        if (!saveCards(this.cardState)) {
          this.$message.error("卡牌奖券保存失败，可能是存储空间已满");
        }
      } catch (error) {
        console.warn("[cards] 发放奖券失败，已跳过", error);
        this.lastGrants = [];
      }
    },

    /**
     * 本局新点亮的勋章：解锁时刻落在「上一局之后、本局之内」就算刚点亮。
     * 勋章是重放 history 算出来的，所以必须在 history 更新之后调用。
     *
     * ⚠️ 为什么不用 `time === game.time`：**赛季冠军**的解锁时刻是**赛季收官点**，
     * 不是任何一局的时间点 —— 收官后第一次结算它才会落进窗口，正好提示 + 计券一次，
     * 之后不再重复。用等号的话这枚章永远发不出去（券也拿不到）。
     * 返回值带标题，结算面板要写清"点亮了哪一枚"，只报数量等于没说。
     *
     * @returns {object} 主账号名 → { count, items: [{title, icon, kind}] }
     */
    countNewMedals(game, prevRound) {
      const map = {};
      const from = prevRound ? Number(prevRound.time) || 0 : 0;
      const to = Number(game.time) || 0;
      try {
        buildAchievements(this.history, this.allPlayers, { now: to }).forEach(
          (item) => {
            if (!item.unlocked) return;
            (item.owners || []).forEach((owner) => {
              const at = Number(owner.time) || 0;
              if (at <= from || at > to) return;
              const entry = map[owner.name] || { count: 0, items: [] };
              entry.count += 1;
              entry.items.push({
                key: item.key,
                title: item.title,
                icon: item.icon,
                kind: item.kind,
              });
              map[owner.name] = entry;
            });
          }
        );
      } catch (error) {
        console.warn("[cards] 统计新勋章失败，按 0 枚处理", error);
      }
      return map;
    },

    /**
     * 本局刷新了记录榜哪几项：对比「入账前 / 入账后」两份记录榜。
     * 必须在 history 更新之后调用（入账前的那份由 applyResult 提前存好传进来）。
     * 返回值带每项的标题，结算面板要写清"创造了什么纪录"。
     */
    countNewRecords(prevHistory) {
      try {
        return buildNewRecords(prevHistory, this.history, this.allPlayers);
      } catch (error) {
        console.warn("[cards] 统计新纪录失败，按 0 项处理", error);
      }
      return {};
    },

    /**
     * 结算面板的明细行：把"创造新纪录 ×2"摊开成「新纪录：单局最大赢家、单日最高盈利」。
     * 没有明细的规则（上桌、赢一局…）不占行，免得每行都跟一句废话。
     *
     * @returns {Array<{label: string, text: string}>} label 单独渲染成前缀，长文才好扫
     */
    ticketDetails(item) {
      return ((item && item.reasons) || [])
        .filter((reason) => reason.details && reason.details.length)
        .map((reason) => ({
          label: reason.detailLabel || "明细",
          text: reason.details.join("、"),
        }));
    },

    /**
     * 今日结算：把今日榜前三名送上领奖台。
     * 今日榜是内存态（刷新即清空），所以没有战绩时直接提示，不放空台上台。
     */
    openDailyPodium() {
      if (!this.todayRanking.length) {
        this.$message.info("今天还没有战绩，先开局再来结算");
        return;
      }
      // 每次打开重读一次：过了零点就自动作废昨天的领奖记录
      this.daily = loadDaily();
      this.podiumVisible = true;
    },

    /** 冠军把免费抽卡领走了，记下来，今天不再发第二次 */
    markDailyClaim(name) {
      this.daily = { ...loadDaily(), claimed: true, name: String(name || "") };
      if (!saveDaily(this.daily)) {
        this.$message.error("今日结算记录保存失败，可能是存储空间已满");
      }
    },

    /** 打开模块中心；同一个容器里切七个视图，一次只渲染一个 */
    openModule(key) {
      this.stageModule = key;
      this.stageVisible = true;
    },

    openCardDrawer() {
      // 结算抽屉的层级更高，直接开模块中心会被它盖住。
      // 先收桌子（数据已入账，不会二次确认），等抽屉关完再进卡牌。
      this.drawer = false;
      window.setTimeout(() => {
        // settling = 「已结算但桌还没收」。这 320ms 里用户要是点了再来一局 / 关闭，
        // 牌桌已经重置过，就别再清一次、也别再把卡牌层弹出来盖住新局。
        if (!this.settling) return;
        // 抽卡也算本局结束：回来必须是一张空桌，不能还摆着上一局的筹码
        this.resetBoard();
        this.openModule("cards");
      }, 320);
    },

    /** 子组件抽卡 / 合成后回传新存档，落盘统一在这里做 */
    handleCardsUpdate(nextState) {
      this.cardState = nextState;
      if (!saveCards(this.cardState)) {
        this.$message.error("卡牌存档保存失败，可能是存储空间已满");
      }
    },

    handleClose(done) {
      // 已结算的情况数据早就入账了，关掉只是收桌子，不必再问一次
      if (this.settling) {
        done();
        this.resetBoard();
        return;
      }

      this.$confirm("确认关闭？关闭后本局录入将被清空", "提示")
        .then(() => {
          done();
          this.resetBoard();
        })
        .catch(() => {});
    },

    /** 关闭结算面板并收桌子（数据已入账，无需二次确认） */
    closeDrawer() {
      this.drawer = false;
      this.resetBoard();
    },

    /**
     * 再来一局：沿用刚打完的这批人，重新随机分座、筹码回到初始值。
     * 本局战绩已经计过，这里只负责开新局，不会再写一次分。
     */
    playAgain() {
      const allowed = new Set(selectableNames(this.allPlayers));
      const names = limitOnePerMain(
        this.allPlayers,
        this.playersSort.map((row) => row.name).filter((name) => allowed.has(name))
      );

      if (!names.length) {
        this.$message.warning("没有可上桌的玩家，请先到玩家管理里加人");
        return;
      }

      this.drawer = false;
      this.resetBoard();
      this.selectPlayers = names;
      this.resetSeat();
      this.$message.success("已重新随机分座，开盘！");
    },

    resetBoard() {
      this.playersSort = [];
      this.records = [];
      this.transfers = [];
      this.chipCalcVisible = false;
      this.chipCalcName = "";
      this.chipCalcSnapshot = null;
      this.isPlaying = false;
      this.settling = false;
    },

    async copyTransfers() {
      const text = `${new Date().toLocaleString("zh-CN")} 结算方案\n${formatTransfers(
        this.transfers
      )}`;
      const ok = await copyText(text);
      if (ok) {
        this.$message.success("转账方案已复制，可以直接发到群里");
      } else {
        this.$message.error("复制失败，请手动选择文本复制");
      }
    },

    removeHistoryGame(id) {
      const next = this.history.filter((game) => game.id !== id);
      if (next.length === this.history.length) return;
      this.history = next;
      const saved = saveHistory(this.history);
      this.rebuildRankings();
      if (!saved) {
        this.$message.error("流水保存失败，刷新页面后这局会重新出现");
        return;
      }
      this.$message.success("已删除该局记录，相关战绩已同步回滚");
    },

    clearHistory() {
      this.history = [];
      const saved = saveHistory(this.history);
      this.rebuildRankings();
      if (!saved) {
        this.$message.error("流水保存失败，刷新页面后记录会重新出现");
        return;
      }
      this.$message.success("对局流水已清空，全部战绩已归零");
    },

    /**
     * 流水变动后，让排行榜跟着回到「只反映现存流水」的状态。
     *
     * 增量累加（applyOutcome）只能往前推，删/清流水时没法往回退，
     * 只能从第一条流水整体重放 —— 否则总榜、段位、记录榜、勋章墙
     * 会继续按已经不存在的牌局算账，而且永远修不回来。
     *
     * ⚠️ 今日榜只重放**当天**的流水，不然删一局旧账会把今天的分也一起冲掉。
     */
    rebuildRankings() {
      const today = todayKey();
      this.allPlayers = rebuildPlayersFromHistory(this.history, this.allPlayers);
      this.players = rebuildPlayersFromHistory(this.history, this.players, {
        filter: (game) => todayKey(Number(game.time) || 0) === today,
      });
      if (!savePlayers(this.allPlayers)) {
        this.$message.error("排行榜保存到本地失败，可能是存储空间已满");
      }
    },

    handleRename({ oldName, newName }) {
      // 改名时，子账号的 parent 指向也要跟着改，否则归属会断链
      const renameList = (list) =>
        list.map((player) => {
          const next = { ...player };
          if (next.name === oldName) next.name = newName;
          if (next.parent === oldName) next.parent = newName;
          return next;
        });

      this.allPlayers = renameList(this.allPlayers);
      this.players = renameList(this.players);
      this.selectPlayers = this.selectPlayers.map((name) =>
        name === oldName ? newName : name
      );
      this.playersSort = this.playersSort.map((row) =>
        row.name === oldName ? { ...row, name: newName } : row
      );
      this.history = this.history.map((game) => ({
        ...game,
        records: game.records.map((record) =>
          record.name === oldName ? { ...record, name: newName } : record
        ),
        transfers: (game.transfers || []).map((item) => ({
          ...item,
          from: item.from === oldName ? newName : item.from,
          to: item.to === oldName ? newName : item.to,
        })),
      }));

      // 卡包也要跟着改名，否则改名后奖券和卡牌会凭空消失
      this.cardState = renameCardState(this.cardState, oldName, newName);
      const savedCards = saveCards(this.cardState);
      const savedPlayers = savePlayers(this.allPlayers);
      const savedHistory = saveHistory(this.history);
      this.refreshPlayerOptions();
      if (!savedCards || !savedPlayers || !savedHistory) {
        this.$message.error("改名保存失败，可能是存储空间已满，刷新后会退回旧名字");
        return;
      }
      this.$message.success("昵称已更新，历史流水同步完成");
    },

    handleRemovePlayer(name) {
      // 删主账号时，名下的子账号升级为独立主账号，战绩保留不丢
      const subCount = this.allPlayers.filter(
        (player) => player.parent === name
      ).length;

      this.allPlayers = this.allPlayers
        .filter((player) => player.name !== name)
        .map((player) =>
          player.parent === name
            ? { ...player, parent: null, isMain: false }
            : player
        );
      this.players = this.players.filter((player) => player.name !== name);
      this.selectPlayers = this.selectPlayers.filter((item) => item !== name);

      // 卡包一并清掉，避免留下无主存档
      this.cardState = removeCardState(this.cardState, name);
      const savedCards = saveCards(this.cardState);
      const savedPlayers = savePlayers(this.allPlayers);
      this.refreshPlayerOptions();
      if (!savedCards || !savedPlayers) {
        this.$message.error("删除保存失败，可能是存储空间已满，刷新后玩家会重新出现");
        return;
      }
      this.$message.success(
        subCount
          ? `已删除「${name}」，其 ${subCount} 个子账号已升级为独立号`
          : `已删除玩家「${name}」`
      );
    },

    /**
     * 清空全部数据（玩家管理 → 清空全部数据，已二次确认）。
     * 只留底注设置，其余键整体抹掉后直接刷新页面 —— 内存里还有一堆派生状态
     * （今日榜 / 选人 / 卡包 / 奖券），逐个重置容易漏，刷新最干净。
     */
    handleWipeData() {
      Object.values(STORAGE_KEYS).forEach((key) => {
        if (key === STORAGE_KEYS.settings) return;
        window.localStorage.removeItem(key);
      });
      window.localStorage.removeItem("undefined"); // 历史脏键
      window.sessionStorage.removeItem("pk:cardOwner"); // 卡牌页选人记忆
      window.location.reload();
    },

    handleSaveSettings() {
      const baseChips = Number(this.settingsForm.baseChips);
      if (!Number.isFinite(baseChips) || baseChips <= 0) {
        this.$message.error("底注筹码必须大于 0");
        return;
      }

      this.settings = { ...this.settings, baseChips };
      if (!saveSettings(this.settings)) {
        this.$message.error("设置保存失败，可能是存储空间已满");
        return;
      }
      this.settingsVisible = false;

      // 已开局的情况下同步刷新投入额（剩余筹码由玩家重新清点）
      this.playersSort.forEach((row) => {
        row.buyIn = baseChips;
      });
      this.$message.success("设置已保存");
    },

    /* -------------------------------------------------------------- */
    /* 云备份（GitHub Gist）                                           */
    /* -------------------------------------------------------------- */

    /** 打包当前本机数据。daily 不进云，见 sync.js */
    takeSnapshot() {
      return buildSnapshot({
        players: this.allPlayers,
        history: this.history,
        settings: this.settings,
        cards: this.cardState,
      });
    },

    /** 把云端存档写回本机，并立刻落盘 + 刷新界面 */
    applySnapshot(snapshot) {
      // 云端存档可能是别的设备按更高预算存的，落地前先按本机预算收一遍
      const restored = trimHistory(snapshot.history);
      // 数据就是从云端下来的，别再推回去 —— 时间戳相同会被服务端拒，白弹一条告警
      muteLocalChange(() => {
        this.allPlayers = snapshot.players;
        this.history = restored.list;
        this.settings = snapshot.settings;
        this.cardState = snapshot.cards;
        // 恢复是「丢数据」场景里最不能静默失败的一步：写不进去就等于白恢复
        const results = [
          savePlayers(this.allPlayers),
          saveHistory(this.history),
          saveSettings(this.settings),
          saveCards(this.cardState),
        ];
        if (results.includes(false)) {
          this.$message.error("云端数据写入本机失败，可能是存储空间已满");
        }
        this.settingsForm = { ...this.settings };
        this.refreshPlayerOptions();
      });
      if (restored.dropped) {
        this.$message.warning(
          `云端存档超过本机流水上限，最早的 ${restored.dropped} 局没有恢复`
        );
      }
    },

    /**
     * 本机没有 gistId 时去云端认领一份。
     * 换设备登录后就是这种状态 —— 只记得 token，不知道存档在哪。
     */
    async resolveGistId(token) {
      try {
        return await findGistId(token);
      } catch (error) {
        return ""; // 认领失败不影响后续：拿不到就当没有，走新建
      }
    },

    /**
     * 上传前的安全闸。
     *
     * 本机 syncedUpdatedAt 为 0 = 这台设备从没跟云端对过账，而云端已经有存档
     * —— 说明本机大概率是台新设备（数据可能是空的）。这时候拿本机覆盖云端，
     * 等于把真数据抹掉，是本项目最容易出事的一步，必须先问。
     *
     * @returns {Promise<boolean>} true 表示可以放心上传
     */
    async guardBeforeUpload(gistId, silent) {
      const cloud = this.cloud;
      if (cloud.syncedUpdatedAt) return true; // 对过账了，正常覆盖

      let parsed = null;
      try {
        parsed = parseSnapshot(await fetchGist(cloud.token, gistId));
      } catch (error) {
        return true; // 云端读不出来，就当它没有
      }
      if (!parsed.ok) return true;

      if (silent) {
        // 自动备份不自作主张，交给启动时那句提示去问用户
        return false;
      }
      const when = this.formatCloudTime(parsed.snapshot.updatedAt);
      try {
        await this.$confirm(
          `云端已有一份存档（${when}），而本机还没同步过。继续上传会用本机数据覆盖它。`,
          "确认覆盖云端存档",
          { confirmButtonText: "仍要覆盖", cancelButtonText: "取消", type: "warning" }
        );
        return true;
      } catch (error) {
        return false; // 用户取消
      }
    },

    /**
     * 上传到云端。没有 gistId 就先建一个 secret gist。
     * @param {boolean} silent true 时成功不弹提示（结算后自动备份用）
     */
    async uploadSnapshot(silent) {
      const cloud = this.cloud;
      if (!cloud || !cloud.token || this.cloudBusy) return false;
      this.cloudBusy = true;
      try {
        const snapshot = this.takeSnapshot();
        const content = JSON.stringify(snapshot);
        // ⚠️ 本机没记着 gistId 不代表云端没有（换设备就是这种状态）。
        // 先去认领一份，认不到才新建 —— 否则会建出第二份空存档，把真数据顶掉
        let gistId = cloud.gistId || (await this.resolveGistId(cloud.token));
        if (gistId && !(await this.guardBeforeUpload(gistId, silent))) return false;

        if (!gistId) {
          gistId = await createGist(cloud.token, content);
          if (!gistId) throw new Error("创建云端存档失败");
        } else {
          await updateGist(cloud.token, gistId, content);
        }

        this.cloud = {
          ...cloud,
          gistId,
          lastSyncAt: Date.now(),
          syncedUpdatedAt: snapshot.updatedAt,
        };
        saveCloud(this.cloud);

        if (!silent) this.$message.success("已备份到云端");
        if (isSnapshotTooBig(snapshot)) {
          this.$message.warning("备份体积接近上限，建议再导出一份本地存档");
        }
        return true;
      } catch (error) {
        const text = error && error.message ? error.message : "备份失败";
        // 自动备份失败也要出声：不然用户会以为数据已经安全了
        if (silent) this.$message.warning(`云端备份未成功：${text}`);
        else this.$message.error(text);
        return false;
      } finally {
        this.cloudBusy = false;
      }
    },

    /** 结算后静默推一份。失败只提示，绝不打断本局 */
    autoBackupToCloud() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token || !cloud.autoBackup) return;
      this.uploadSnapshot(true);
    },

    /**
     * 本地任何改动后的防抖备份。
     * 一局结算会连写三四次盘（players / history / settings / cards），
     * 防抖把它们合并成一次请求，省得来回折腾 GitHub。
     */
    scheduleCloudBackup() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token || !cloud.autoBackup) return;
      this.clearCloudBackupTimer();
      this.cloudBackupTimer = setTimeout(() => {
        this.cloudBackupTimer = null;
        this.uploadSnapshot(true);
      }, 3000);
    },

    clearCloudBackupTimer() {
      if (this.cloudBackupTimer) clearTimeout(this.cloudBackupTimer);
      this.cloudBackupTimer = null;
    },

    /** 打开设置弹窗：顺手把「更换 token」的输入框收回去，免得上次没填完一直挂着 */
    openSettings() {
      this.cloudTokenEditing = false;
      this.settingsVisible = true;
    },

    /** 已有 token 时想换一个：把输入框展开，原来的按钮先收起来 */
    startEditCloudToken() {
      this.cloudForm = { token: "" };
      this.cloudTokenEditing = true;
    },

    cancelEditCloudToken() {
      this.cloudTokenEditing = false;
      this.cloudForm = { token: "" };
    },

    handleSaveCloudToken() {
      const token = String(this.cloudForm.token || "").trim();
      if (!token) {
        this.$message.warning("请先粘贴 token");
        return;
      }
      if (isFineGrainedToken(token)) {
        this.$message.error(
          "这是细粒度 token（github_pat_ 开头），GitHub 没给它读写 Gist 的权限，生成时也勾不到。" +
            "请换成 classic token：Developer settings → Personal access tokens → Tokens (classic)，只勾 gist。"
        );
        return;
      }

      const prev = loadCloud();
      const changed = !!prev.token && prev.token !== token;
      // 换了 token 就把 gistId 忘掉，下次上传重新按文件名认领。
      // 同账号换 token 能认回同一份；换成别账号的 token 则当作新网盘，不会误写旧存档。
      this.cloud = { ...prev, token, gistId: changed ? "" : prev.gistId };
      if (!saveCloud(this.cloud)) {
        // token 没落盘 = 刷新就丢，用户会以为已经连上了，必须说清楚
        this.$message.error("token 保存到本机失败，可能是存储空间已满");
        return;
      }
      this.cloudTokenEditing = false;
      this.$message.success(
        changed
          ? "token 已更换，点「立即备份」接回云端存档"
          : "token 已保存到本机，点「立即备份」试试能不能连上"
      );
    },

    handleBackupNow() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token) {
        this.$message.warning("请先填写并保存 token");
        return;
      }
      this.uploadSnapshot(false);
    },

    /**
     * 弹框问要不要用云端存档覆盖本机，确认后落盘。
     * 换设备登录时 syncedUpdatedAt 为 0，文案要说清「本机还没同步过」。
     */
    promptRestore(snapshot) {
      const when = snapshot.updatedAt ? this.formatCloudTime(snapshot.updatedAt) : "未知时间";
      const fresh = !(this.cloud && this.cloud.syncedUpdatedAt);
      this.$confirm(
        fresh
          ? `云端有一份存档（${when}），本机还没同步过。要现在恢复吗？`
          : `云端存档比本机新（${when}），恢复后本机未备份的改动会丢失。`,
        "发现云端存档",
        { confirmButtonText: "恢复", cancelButtonText: "暂不", type: "warning" }
      )
        .then(() => {
          this.applySnapshot(snapshot);
          this.cloud = {
            ...this.cloud,
            syncedUpdatedAt: snapshot.updatedAt,
            lastSyncAt: Date.now(),
          };
          saveCloud(this.cloud);
          this.$message.success("已从云端恢复");
        })
        .catch(() => {});
    },

    async handleRestoreFromCloud() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token) {
        this.$message.warning("请先填写并保存 token");
        return;
      }
      if (this.cloudBusy) return;
      this.cloudBusy = true;

      let gistId = cloud.gistId;
      let snapshot = null;
      try {
        if (!gistId) {
          // 换设备后本机不记得存档在哪，只凭 token 去云端认领
          gistId = await findGistId(cloud.token);
          if (!gistId) {
            this.$message.warning(
              "这个 token 名下还没有云端存档，先在有数据的那台电脑上点一次「立即备份」"
            );
            return;
          }
          // 认领成功就记到本机，省得以后每次都列一遍
          this.cloud = { ...this.cloud, gistId };
          saveCloud(this.cloud);
        }
        const parsed = parseSnapshot(await fetchGist(cloud.token, gistId));
        if (!parsed.ok) throw new Error(parsed.reason);
        snapshot = parsed.snapshot;
      } catch (error) {
        this.$message.error(error && error.message ? error.message : "读取云端存档失败");
        return;
      } finally {
        this.cloudBusy = false;
      }

      this.promptRestore(snapshot);
    },

    /**
     * 打开页面时主动看一眼云端 —— 这是「换台电脑也能拿到最新数据」的落地处。
     * 新设备 syncedUpdatedAt 是 0，云端必定更新 → 提示恢复；
     * 同一台电脑自己打开时两边时间一致，不会打扰。
     */
    async checkCloudOnStart() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token) return;
      try {
        let gistId = cloud.gistId;
        if (!gistId) {
          gistId = await this.resolveGistId(cloud.token);
          if (gistId) {
            this.cloud = { ...this.cloud, gistId };
            saveCloud(this.cloud);
          }
        }
        if (!gistId) return;
        const parsed = parseSnapshot(await fetchGist(cloud.token, gistId));
        if (!parsed.ok) return;
        // 本机已经跟云端一样新，就不用问了
        if (parsed.snapshot.updatedAt <= (this.cloud.syncedUpdatedAt || 0)) return;
        this.promptRestore(parsed.snapshot);
      } catch (error) {
        // 启动检查失败不弹窗打扰，记日志即可；用户仍能手动点恢复
        console.warn("[cloud] 启动时检查云端存档失败", error);
      }
    },

    handleDisconnectCloud() {
      this.$confirm(
        "断开后本机不再自动备份；已上传的云端存档不会被删除，重新填 token 即可接回。",
        "断开云备份",
        { confirmButtonText: "断开", cancelButtonText: "取消", type: "warning" }
      )
        .then(() => {
          clearCloud();
          this.cloud = loadCloud();
          this.cloudForm = { token: "" };
          this.$message.success("已断开云备份");
        })
        .catch(() => {});
    },

    /**
     * 清空云端存档：删掉 GitHub 上那份 gist。
     *
     * 与「断开连接」的区别：断开只是本机不再备份，云端那份还躺着；
     * 这里是真把云端数据销毁掉（本项目唯一一处销毁云端数据的地方）。
     * 本机 localStorage 一概不碰 —— 名册、流水、卡包都还在，
     * 之后本机一有改动，3 秒防抖备份就会按本机数据重建一份。
     */
    async handleClearCloud() {
      const cloud = this.cloud;
      if (!cloud || !cloud.token) return;

      try {
        await this.$confirm(
          "会删除 GitHub 上那份备份存档，删掉后无法从云端找回。本机的名册、流水、" +
            "卡包都不会动；之后本机只要再有改动（或点「立即备份」），会自动按本机数据重建一份。",
          "清空云端存档",
          {
            confirmButtonText: "删除云端存档",
            cancelButtonText: "取消",
            type: "warning",
            confirmButtonClass: "el-button--danger",
          }
        );
      } catch (error) {
        return; // 用户取消
      }

      this.cloudBusy = true;
      try {
        // 本机不记得 gistId 时（换过设备）先按文件名认领，否则会白跑一趟
        const gistId = cloud.gistId || (await this.resolveGistId(cloud.token));
        if (!gistId) {
          this.$message.info("云端没有找到存档，不需要清理");
          return;
        }

        const deleted = await deleteGist(cloud.token, gistId);
        // gistId 清空 → 卡片回到「等待首次备份」，下次上传重新认领或新建。
        // syncedUpdatedAt 保留不动：这台设备确实跟云端对过账，清掉反而会让
        // 下次上传误判成「新设备」而弹确认框。
        this.cloud = { ...cloud, gistId: "", lastSyncAt: 0 };
        if (!saveCloud(this.cloud)) {
          this.$message.error("本机云备份状态保存失败，刷新后可能还显示旧状态");
          return;
        }
        this.$message.success(
          deleted ? "云端存档已删除，本机数据未改动" : "云端存档本来就不存在，已重新配对"
        );
      } catch (error) {
        this.$message.error(
          error && error.message ? error.message : "清空云端存档失败"
        );
      } finally {
        this.cloudBusy = false;
      }
    },

    formatCloudTime(time) {
      const date = new Date(time);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(
        date.getHours()
      )}:${pad(date.getMinutes())}`;
    },

    handleExportJson() {
      exportJson();
      this.$message.success("备份文件已下载");
    },

    handleExportCsv() {
      exportCsv();
      this.$message.success("CSV 已下载");
    },

    handleImportFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const { ok, data, error } = parseBackup(reader.result);
        if (!ok) {
          this.$message.error(error);
          return;
        }
        this.$confirm(
          "覆盖导入会替换现有数据，合并导入会保留现有数据并补充新内容",
          "导入备份",
          {
            distinguishCancelAndClose: true,
            confirmButtonText: "覆盖导入",
            cancelButtonText: "合并导入",
            type: "warning",
          }
        )
          .then(() => this.doImport(data, "replace"))
          .catch((action) => {
            if (action === "cancel") this.doImport(data, "merge");
          });
      };
      reader.onerror = () => this.$message.error("文件读取失败");
      reader.readAsText(file.raw);
    },

    doImport(data, mode) {
      const { players, history, cards, dropped, saved } = applyBackup(data, mode);
      // 一律以落盘后的真实数据为准：写失败时内存里是新的、磁盘上是旧的，
      // 直接拿内存数据展示会骗人
      this.allPlayers = loadPlayers();
      this.history = loadHistory();
      this.cardState = loadCards();
      this.refreshPlayerOptions();
      if (!saved) {
        this.$message.error("导入写入本机失败，可能是存储空间已满，请先清理后重试");
        return;
      }
      this.$message.success(
        `导入完成：${players} 位玩家、${history} 条对局流水、${cards} 份卡包`
      );
      // 存档本身超预算时如实说明，不然用户会以为全部历史都在
      if (dropped) {
        this.$message.warning(
          `存档超过本机流水上限，最早的 ${dropped} 局没有导入（当前保留 ${history} 局）`
        );
      }
    },

    shuffle(array) {
      const arr = [...array];
      for (let i = arr.length; i; i -= 1) {
        const j = Math.floor(Math.random() * i);
        [arr[i - 1], arr[j]] = [arr[j], arr[i - 1]];
      }
      return arr;
    },
  },
};
</script>

<style scoped>
.detail {
  min-height: 100vh;
  padding-bottom: 28px;
}

/* ---------------- 顶部品牌区 ---------------- */
.hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 22px 28px 46px;
  background:
    radial-gradient(
      900px 220px at 6% -60%,
      rgba(124, 162, 255, 0.3),
      transparent 62%
    ),
    linear-gradient(
      118deg,
      var(--pk-navy-1) 0%,
      var(--pk-navy-2) 56%,
      var(--pk-navy-3) 100%
    );
  color: #fff;
  overflow: hidden;
}
/* 背景里两枚花色：压到最右角落，只当纹理，别跑到标题后面 */
.hero::after {
  content: "♠ ♥";
  position: absolute;
  right: -6px;
  bottom: -46px;
  font-size: 112px;
  line-height: 1;
  letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.04);
  pointer-events: none;
  user-select: none;
}
.hero__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hero__mark {
  width: 46px;
  height: 46px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  font-size: 21px;
  color: #f4dfae;
  background: linear-gradient(
    150deg,
    rgba(255, 255, 255, 0.17),
    rgba(255, 255, 255, 0.04)
  );
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}
.hero__title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.hero__sub {
  margin: 4px 0 0;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.58);
}
.hero__stats {
  display: flex;
  align-items: center;
  gap: 18px;
}
.hero__stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.hero__stat-k {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}
.hero__stat-v {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.hero__stat-u {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}
.hero__stat-sep {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.16);
}

/* ---------------- 操作条：浮在品牌区下沿 ---------------- */
.toolbar {
  position: relative;
  z-index: 2;
  margin: -32px 20px 18px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  background: #fff;
  border: 1px solid var(--pk-line);
  border-radius: var(--pk-radius-lg);
  box-shadow: var(--pk-shadow-2);
}
.toolbar__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-start {
  height: 38px;
  padding: 0 20px;
  font-size: 14px;
  letter-spacing: 0.02em;
}
.select-players {
  width: 318px;
}
.select-players ::v-deep .el-tag {
  background: var(--pk-primary-soft);
  border-color: #dbe3fb;
  color: var(--pk-primary-dark);
  border-radius: 6px;
}
.select-players ::v-deep .el-tag .el-tag__close {
  color: #7d8fc4;
}
.select-players ::v-deep .el-tag .el-tag__close:hover {
  background: #c3cff5;
  color: #fff;
}
/* 空名册提示：slot 内容带着本组件的 scope 属性，teleport 到 body 也照样命中 */
.select-players__empty {
  display: block;
  padding: 10px 14px 12px;
  color: #8a92a6;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  white-space: normal;
}
.toolbar__tools {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}
.toolbar__divider {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--pk-line);
}
/* 工具按钮：默认「隐形」，悬停才上色，避免 10 个彩色按钮打架 */
.tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--pk-radius-sm);
  background: transparent;
  color: var(--pk-ink-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s, border-color 0.16s, color 0.16s;
}
.tool i {
  font-size: 13px;
  color: var(--pk-ink-3);
  transition: color 0.16s;
}
.tool:hover {
  background: var(--pk-primary-soft);
  border-color: #dde4fb;
  color: var(--pk-primary);
}
.tool:hover i {
  color: var(--pk-primary);
}
.tool:focus-visible {
  outline: none;
  border-color: #b9c8f5;
  box-shadow: 0 0 0 3px rgba(58, 85, 200, 0.14);
}
/* 今日结算是每天必点的一次，单独给金色，别混在工具堆里 */
.tool--gold {
  color: #9a6f1c;
  background: var(--pk-gold-soft);
  border-color: #f1dfba;
  font-weight: 500;
}
.tool--gold i {
  color: var(--pk-gold);
}
.tool--gold:hover {
  background: #fbeacb;
  border-color: #e8ce97;
  color: #8a6112;
}
.tool--gold:hover i {
  color: #a97b1f;
}

.content {
  padding: 0 20px;
}
/* 两列各自按内容长高，不强行等高：
   座位表人多时能到 900+，硬拉齐会把右卡的底部说明推出视口。 */
.content ::v-deep .el-col > .el-card {
  display: flex;
  flex-direction: column;
}
.content ::v-deep .el-col > .el-card > .el-card__body {
  display: flex;
  flex-direction: column;
}
/* 榜单卡：表格占满，说明文字贴底，卡片留白就有结构了 */
.rank-wrap {
  display: flex;
  flex-direction: column;
}
.rank-foot {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--pk-ink-3);
}
.rank-foot__hint {
  color: #aab4c8;
}
/* 座位表空态：和表格同一块区域，别再出现「暂无数据」那种灰字 */
.seat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 48px 0;
  text-align: center;
}
.seat-empty i {
  font-size: 30px;
  color: #c3cde3;
}
.seat-empty__title {
  margin: 12px 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--pk-ink-2);
}
.seat-empty__hint {
  font-size: 12px;
  color: var(--pk-ink-3);
}
/* 首次打开的空态：一张卡 + 牌花，别用 Element 那个灰盒子 */
.empty-tip {
  margin: 0 20px;
  min-height: 360px;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--pk-surface);
  border: 1px solid var(--pk-line);
  border-radius: var(--pk-radius-lg);
  box-shadow: var(--pk-shadow-1);
}
.empty-tip__mark {
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 17px;
  font-size: 26px;
  color: var(--pk-primary);
  background: var(--pk-primary-soft);
  border: 1px solid #dbe3fb;
}
.empty-tip__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--pk-ink);
}
.empty-tip__hint {
  font-size: 13px;
  color: var(--pk-ink-3);
}

/* ---------------- 卡片抬头 ---------------- */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.card-header__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--pk-ink);
}
.card-header__title i {
  font-size: 16px;
  color: var(--pk-primary);
}
.card-header--rank .card-header__title i {
  color: var(--pk-gold);
}
.card-header__hint {
  font-size: 12px;
  font-weight: normal;
  color: var(--pk-ink-3);
  white-space: nowrap;
}
.cell-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* 座位表里的头像可以直接点开换，省得绕到玩家管理 */
.cell-avatar {
  cursor: pointer;
  transition: transform 0.15s;
}
.cell-avatar:hover {
  transform: scale(1.08);
}
/* 计算器按钮每行一个，常态压成幽灵按钮，悬停再亮起来，别让表格一片蓝 */
.chip-calc-btn {
  border-color: var(--pk-line-strong);
  background: #fff;
  color: var(--pk-ink-2);
}
.chip-calc-btn:hover,
.chip-calc-btn:focus {
  background: var(--pk-primary-soft);
  border-color: #c3cff5;
  color: var(--pk-primary);
}
/* 筹码输入框别撑满整列，窄一点更像「填写位」 */
.content ::v-deep .el-table .el-input__inner {
  text-align: center;
}
.content ::v-deep .el-table .el-input {
  max-width: 112px;
  margin: 0 auto;
}
/* 一列数字扫下来不能左右跳，统一等宽 */
.content ::v-deep .el-table td {
  font-variant-numeric: tabular-nums;
}
/* 段位徽章：abyss 深渊 / low 吃亏 / even 持平 / high 上手 / god 封神 */
.tier {
  display: inline-block;
  padding: 0 8px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  cursor: default;
}
.tier--abyss {
  background: linear-gradient(135deg, #2f3b52 0%, #171d2b 100%);
}
.tier--low {
  background: linear-gradient(135deg, #4bb36b 0%, #1f7a45 100%);
}
.tier--even {
  background: linear-gradient(135deg, #8ea0b5 0%, #5d6d84 100%);
}
.tier--high {
  background: linear-gradient(135deg, #ff8a5c 0%, #e4572e 100%);
}
.tier--god {
  background: linear-gradient(135deg, #ffd76a 0%, #d99a1c 100%);
  color: #5a3c00;
}
/* 行内所有内容垂直居中，不贴顶也不沉底 */
::v-deep .content .el-table td.el-table__cell {
  vertical-align: middle;
}
::v-deep .content .el-table td.el-table__cell .cell {
  padding-top: 6px;
  padding-bottom: 6px;
}
/* 平账校验做成状态条：平衡淡绿，差钱淡红，扫一眼就知道能不能结算 */
.balance {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  display: flex;
  gap: 10px;
  align-items: center;
  background: var(--pk-surface-2);
  border: 1px solid var(--pk-line);
  transition: background-color 0.2s, border-color 0.2s;
}
.balance.is-ok {
  background: #f3faf6;
  border-color: #d5ecdd;
}
.balance.is-bad {
  background: #fdf4f4;
  border-color: #f4dada;
}
/* 「筹码」操作列：收窄单元格内边距，保证「计算器」按钮完整显示、不贴边被裁切 */
::v-deep .chip-col .cell {
  padding-left: 4px;
  padding-right: 4px;
}
.chip-calc-btn {
  padding-left: 10px;
  padding-right: 10px;
}
/* 筹码计算器弹窗 */
.chip-calc {
  padding: 0;
}
.chip-calc__hint {
  font-size: 12px;
  font-weight: normal;
  color: #909399;
  margin-bottom: 12px;
}
.chip-calc__grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chip-calc__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}
.chip-calc__unit {
  min-width: 58px;
}
.chip-calc__label {
  min-width: 44px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 600;
  text-align: center;
}
.chip-calc__input {
  width: 84px;
}
.chip-calc__amount {
  margin-left: auto;
  min-width: 52px;
  text-align: right;
  color: #303133;
  font-variant-numeric: tabular-nums;
}
.chip-calc__total {
  margin-top: 12px;
  font-size: 13px;
  color: #606266;
}
.chip-calc__total b {
  color: #409eff;
  font-size: 15px;
}
.balance__label {
  font-weight: 600;
  color: var(--pk-ink-2);
}
.balance__value.is-ok {
  color: #2f9e62;
}
.balance__value.is-bad {
  color: #f56c6c;
  font-weight: 600;
}
.account-button {
  text-align: center;
  margin-top: 22px;
  position: relative;
}
.account-button ::v-deep .el-button--primary {
  height: 42px;
  padding: 0 38px;
  font-size: 15px;
  border-radius: 10px;
  letter-spacing: 0.04em;
}
.humane-model {
  position: absolute;
  top: 11px;
  right: 0;
}
/* ---------------- 本局结算抽屉 ---------------- */
::v-deep .result-drawer {
  min-width: 460px;
  max-width: 720px;
}
.result {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f4f6fb;
}

/* 头图：深海军蓝渐变 + 双光晕 + 细斜纹，结算的仪式感都在这儿 */
.result__hero {
  position: relative;
  flex: none;
  padding: 26px 26px 58px;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(135deg, #111c31 0%, #1d2f52 58%, #2b4472 100%);
}
.result__hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    115deg,
    rgba(255, 255, 255, 0.055) 0 1px,
    transparent 1px 9px
  );
  pointer-events: none;
}
.result__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
}
.result__glow--a {
  width: 230px;
  height: 230px;
  right: -70px;
  top: -100px;
  background: rgba(86, 128, 255, 0.5);
}
.result__glow--b {
  width: 170px;
  height: 170px;
  left: -60px;
  bottom: -90px;
  background: rgba(195, 144, 47, 0.4);
}
.result__eyebrow {
  position: relative;
  margin: 0 0 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: rgba(197, 214, 245, 0.7);
}
.result__title {
  position: relative;
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.result__meta {
  position: relative;
  margin: 9px 0 0;
  font-size: 12.5px;
  color: rgba(197, 214, 245, 0.76);
}
.result__close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #dbe6fb;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.24s ease;
}
.result__close:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: rotate(90deg);
}

/* 头图 + 赢家卡：不参与滚动 */
.result__top {
  position: relative;
  flex: none;
}

/* 滚动区：头图与按钮固定，中间这段自己滚 */
.result__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 22px 16px;
}

/* 最大赢家卡：负 margin 压在头图下沿，做出层次 */
.champion {
  position: relative;
  z-index: 2;
  margin: -22px 22px 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 16px;
  border: 1px solid #f0dcb4;
  background: linear-gradient(120deg, #ffffff 0%, #fffaf1 58%, #fdf3e0 100%);
  box-shadow: 0 10px 26px rgba(20, 34, 61, 0.14);
}
.champion__crown {
  position: absolute;
  top: -11px;
  left: 16px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #e3b455, #c3902f);
  box-shadow: 0 4px 10px rgba(195, 144, 47, 0.45);
  color: #fff;
  font-size: 13px;
}
.champion__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.champion__tag {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #b08a45;
}
.champion__name {
  font-size: 16px;
  color: #1b2438;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.champion__amount {
  margin-left: auto;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #d9453f;
  font-variant-numeric: tabular-nums;
}

/* 滚动条收细一点，别在浅色底上抢戏 */
.result__scroll::-webkit-scrollbar {
  width: 6px;
}
.result__scroll::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #d6ddec;
}
.result__scroll::-webkit-scrollbar-track {
  background: transparent;
}
/* 入场动效：只用 transform，不碰 opacity —— 万一节流没跑完也不会把内容藏起来 */
@keyframes pk-result-rise {
  from {
    transform: translateY(12px);
  }
  to {
    transform: translateY(0);
  }
}
.champion {
  animation: pk-result-rise 0.4s cubic-bezier(0.22, 0.8, 0.3, 1) backwards;
}
.board__row {
  animation: pk-result-rise 0.34s cubic-bezier(0.22, 0.8, 0.3, 1) backwards;
}
.board__row:nth-child(2) {
  animation-delay: 0.04s;
}
.board__row:nth-child(3) {
  animation-delay: 0.08s;
}
.board__row:nth-child(4) {
  animation-delay: 0.12s;
}
.board__row:nth-child(5) {
  animation-delay: 0.16s;
}
.board__row:nth-child(6) {
  animation-delay: 0.2s;
}

/* 区块小标题 */
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 20px 2px 10px;
}
.section-head__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: #1b2438;
}
.section-head__title i {
  font-size: 15px;
  color: #3a55c8;
}
.section-head__hint {
  font-size: 11.5px;
  color: #98a2b8;
}

/* 盈亏榜：中线为零点，红条向右、绿条向左 */
.board__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.board__row {
  display: grid;
  grid-template-columns: 30px minmax(60px, 92px) 1fr 74px;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid #e9edf6;
  background: #fff;
  transition: transform 0.16s ease, box-shadow 0.16s ease,
    border-color 0.16s ease;
}
.board__row:hover {
  transform: translateX(2px);
  border-color: #d9e1f2;
  box-shadow: 0 8px 18px rgba(20, 34, 61, 0.09);
}
.board__row.is-champion {
  border-color: #edd7a9;
  background: linear-gradient(100deg, #ffffff 52%, #fdf6ea 100%);
}
.board__name {
  font-size: 13.5px;
  color: #1b2438;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.board__bar {
  position: relative;
  height: 8px;
  border-radius: 6px;
  background: #f1f4fa;
  overflow: hidden;
}
.board__axis {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #d8dfee;
}
.board__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 6px;
}
.board__fill.is-win {
  left: 50%;
  background: linear-gradient(90deg, #f4a09a, #e04a44);
}
.board__fill.is-lose {
  right: 50%;
  background: linear-gradient(270deg, #8bd695, #46b05c);
}
.board__delta {
  text-align: right;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}

/* 转账方案：头像 → 轨道 → 头像，金额单独一列 */
.transfers {
  margin-top: 4px;
}
.transfer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr) 66px;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  margin-bottom: 6px;
  border-radius: 12px;
  border: 1px solid #e9edf6;
  background: #fff;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.transfer:hover {
  border-color: #d9e1f2;
  box-shadow: 0 8px 18px rgba(20, 34, 61, 0.07);
}
.transfer__side {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 13px;
}
.transfer__side b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.transfer__side.is-out b {
  color: #4c8b3f;
}
.transfer__side.is-in b {
  color: #c94a44;
}
.transfer__rail {
  position: relative;
  display: flex;
  align-items: center;
  height: 12px;
}
.transfer__dot {
  position: relative;
  z-index: 1;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #b9c6e4;
}
.transfer__line {
  position: absolute;
  left: 2px;
  right: 7px;
  height: 1px;
  background: linear-gradient(90deg, #dfe5f2, #b9c6e4);
}
.transfer__arrow {
  position: absolute;
  right: 0;
  font-size: 11px;
  color: #9fb0d4;
}
.transfer__amount {
  text-align: right;
  font-size: 14px;
  font-weight: 700;
  color: #1b2438;
  font-variant-numeric: tabular-nums;
}
.transfer__amount::before {
  content: "¥";
  margin-right: 2px;
  font-size: 11px;
  font-weight: 500;
  color: #8b96ad;
}

/* 没人需要转账时的空态 */
.result__empty {
  margin-top: 18px;
  padding: 18px;
  text-align: center;
  font-size: 13px;
  color: #7d8ba6;
  background: #fff;
  border: 1px dashed #dbe3f2;
  border-radius: 12px;
}
.result__empty i {
  margin-right: 6px;
  color: #52b06b;
}

/* 本局奖券：金色卡片，和结算头图的香槟金呼应 */
.tickets {
  margin-top: 20px;
  padding: 14px 16px 12px;
  border-radius: 14px;
  border: 1px solid #f0dcb4;
  background: linear-gradient(150deg, #fffdf8, #fdf3e2);
}
.tickets__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tickets__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: #a9772f;
}
.tickets__title i {
  font-size: 15px;
}
.tickets__btn {
  color: #8a5a12 !important;
  background: #fff !important;
  border-color: #ecd6ac !important;
  font-weight: 600;
}
.tickets__btn:hover {
  background: #fff8ea !important;
  border-color: #dcc08a !important;
}
.result__tickets-row {
  display: flex;
  align-items: baseline;
  font-size: 13px;
  line-height: 1.9;
}
.result__tickets-row .ticket-name {
  min-width: 84px;
  font-weight: 500;
}
.result__tickets-row .ticket-count {
  min-width: 42px;
  color: #e6a23c;
  font-weight: 600;
}
.result__tickets-row .ticket-reasons {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  color: #909399;
  font-size: 12px;
}
/* 刷新了什么纪录 / 点亮了哪枚勋章：摊在原因下面，前缀加粗方便一眼扫到 */
.result__tickets-row .ticket-detail {
  display: flex;
  gap: 2px;
  margin-top: 2px;
  padding-left: 7px;
  border-left: 2px solid #e6c68f;
  font-size: 11.5px;
  line-height: 1.65;
  color: #a9772f;
}
.result__tickets-row .ticket-detail__label {
  flex: none;
  font-weight: 600;
  color: #8a5a12;
}
.result__tickets-row .ticket-detail__text {
  min-width: 0;
  word-break: break-word;
}
/* 按钮区固定在最下方：中间那块自己滚，按钮任何时候都够得着 */
.result__footer {
  flex: none;
  padding: 12px 22px 14px;
  background: #fff;
  border-top: 1px solid #e7ebf4;
  box-shadow: 0 -6px 18px rgba(20, 34, 61, 0.05);
}
.result__actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.result__actions-tip {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  color: #909399;
}
.empty-tip {
  padding: 60px 0;
}
.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
.backup-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cloud-actions {
  margin-top: 8px;
}
.cloud-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #67c23a;
}

/* 云备份卡片：状态、上次备份、动作、断开各归其位，靠留白分层，不再堆一串灰字 */
.cloud-card {
  padding: 11px 12px 9px;
  border: 1px solid #e1e7f6;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8faff 0%, #f2f5fd 100%);
}
.cloud-card.is-off {
  border-style: dashed;
  border-color: #e5eaf4;
  background: #fafbfe;
}
.cloud-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.cloud-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #67c23a;
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.15);
}
.cloud-dot.is-off {
  background: #c3c9d6;
  box-shadow: 0 0 0 3px rgba(195, 201, 214, 0.16);
}
.cloud-title {
  font-size: 13px;
  font-weight: 600;
  color: #22335f;
}
.cloud-meta {
  margin-left: auto;
  font-size: 12px;
  color: #9aa2b6;
  white-space: nowrap;
}
.cloud-btns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.cloud-btns.is-pair {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* el-button 默认给相邻按钮加 margin-left，网格里会顶歪 */
.cloud-btns .el-button {
  margin-left: 0;
  width: 100%;
  padding: 7px 5px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cloud-input {
  margin-top: 10px;
}
.cloud-foot {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px 8px;
  margin-top: 8px;
}
/* 断开 / 清空都是次要动作：平时灰着不抢眼，悬停才转红 */
.cloud-foot .cloud-unlink {
  font-size: 12px;
  flex: none;
  color: #9aa2b6;
  transition: color 0.15s;
}
.cloud-foot .cloud-unlink:hover {
  color: #f56c6c;
}
.cloud-foot .cloud-unlink.is-disabled,
.cloud-foot .cloud-unlink.is-disabled:hover {
  color: #ccd2de;
  cursor: not-allowed;
}
.cloud-foot__dot {
  font-size: 12px;
  color: #ccd2de;
}
.cloud-foot__hint {
  font-size: 11px;
  color: #a6adbe;
  margin-left: auto;
}
.cloud-foot__hint {
  font-size: 12px;
  line-height: 1.5;
  color: #a4abbc;
}
.cloud-tips {
  margin-top: 7px;
}
.cloud-tips .form-tip {
  margin: 0;
}
.cloud-more {
  font-size: 12px;
  line-height: 1.6;
}
.cloud-help {
  margin-top: 6px;
  padding: 7px 10px;
  border: 1px dashed #e1e7f6;
  border-radius: 8px;
  background: #f8faff;
}
.cloud-help p {
  margin: 0;
  font-size: 12px;
  line-height: 1.75;
  color: #7b8398;
}
.cloud-help b {
  color: #3a55c8;
  font-weight: 600;
}
.cloud-help .cloud-help__warn {
  color: #d99a2b;
}
.upload-inline {
  display: inline-block;
}
.delta--win {
  color: #f56c6c;
  font-weight: 600;
}
.delta--lose {
  color: #67c23a;
  font-weight: 600;
}
.score--win {
  color: #f56c6c;
  font-weight: 600;
}
.score--lose {
  color: #67c23a;
  font-weight: 600;
}

/* ---------------- 窄屏座位卡（isCompact 时渲染） ----------------
   手机一列、平板竖屏自动两列：240 是卡里一排「头像+长名字+段位+盈亏」的下限 */
.seat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.seat-row {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--pk-line);
  border-radius: 12px;
  background: #fff;
}
.seat-row__no {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pk-primary);
  background: var(--pk-primary-soft);
  font-variant-numeric: tabular-nums;
}
.seat-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seat-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.seat-row__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--pk-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 盈亏顶到最右，和名字之间留白，扫一列时数字对齐 */
.seat-row__delta {
  margin-left: auto;
  flex: none;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.seat-row__foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seat-row__foot .el-input {
  flex: 1;
  min-width: 0;
}
.seat-row__foot .chip-calc-btn {
  flex: none;
}

/* 平板竖屏（≤1024）：左栏只有 ~500px，结算按钮居中后右边缘正好撞上
   绝对定位的人道模式开关，把它放回文档流 */
@media (max-width: 1024px) {
  .humane-model {
    position: static;
    display: flex;
    justify-content: center;
    margin-top: 10px;
  }
  /* 平账校验一行放不下时「平账校验」四个字会被拆开，改成上下两行 */
  .balance {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 12px;
  }
}

/* ================= 窄屏（≤768）=================
   原则：横向能省的全省，纵向该分的分 —— 不靠缩放，靠重新排列。 */
@media (max-width: 768px) {
  /* 顶栏：标题缩一圈，三个数平分一行 */
  .hero {
    padding: 16px 14px 38px;
    gap: 12px;
  }
  .hero__mark {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    font-size: 18px;
  }
  .hero__title {
    font-size: 16px;
  }
  .hero__sub {
    margin-top: 2px;
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .hero::after {
    font-size: 84px;
    bottom: -34px;
  }
  .hero__stats {
    width: 100%;
    gap: 0;
    justify-content: space-between;
  }
  .hero__stat {
    gap: 4px;
  }
  .hero__stat-k {
    font-size: 10px;
  }
  .hero__stat-v {
    font-size: 16px;
  }

  /* 操作条：开局一行、选人一行、工具横向滚一行，不再三层堆高 */
  .toolbar {
    margin: -26px 12px 12px;
    padding: 10px 12px;
    gap: 10px;
    border-radius: 14px;
  }
  .toolbar__main {
    width: 100%;
    gap: 8px;
  }
  .btn-start {
    flex: 1;
    height: 36px;
    padding: 0 16px;
  }
  .select-players {
    width: 100%;
    order: 3;
  }
  .toolbar__tools {
    width: 100%;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .toolbar__tools::-webkit-scrollbar {
    display: none;
  }
  .toolbar__divider {
    display: none;
  }
  /* 单行滚动时每个工具都得看得出能点，补上浅底 */
  .tool {
    flex: none;
    height: 32px;
    padding: 0 10px;
    background: var(--pk-surface-2);
    border-color: var(--pk-line);
  }

  /* 两栏改上下堆叠：13/11 的浮动态在 375 宽下各只剩 200px */
  .content {
    padding: 0 12px;
  }
  .content ::v-deep .el-col {
    float: none;
    width: 100% !important;
  }
  .content ::v-deep .el-col + .el-col {
    margin-top: 14px;
  }
  .content ::v-deep .el-card__header {
    padding: 12px 14px;
  }
  .content ::v-deep .el-card__body {
    padding: 12px 14px;
  }
  .card-header {
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .card-header__title {
    font-size: 14px;
  }
  .card-header__hint {
    font-size: 11.5px;
    white-space: normal;
  }
  .seat-empty {
    min-height: 200px;
    padding: 32px 0;
  }
  .account-button {
    margin-top: 16px;
  }
  .account-button ::v-deep .el-button--primary {
    width: 100%;
    height: 40px;
  }
  .rank-foot {
    font-size: 11.5px;
  }
  .empty-tip {
    margin: 0 12px;
    padding: 40px 18px;
  }

  /* 结算抽屉铺满整屏：45% 在手机上连名字都放不下 */
  ::v-deep .result-drawer {
    min-width: 0;
    max-width: none;
  }
  .result__hero {
    padding: 22px 16px 52px;
  }
  .result__title {
    font-size: 22px;
  }
  .champion {
    margin: -20px 14px 0;
    padding: 12px 14px;
    gap: 10px;
  }
  .champion__amount {
    font-size: 20px;
  }
  .result__scroll {
    padding: 6px 14px 14px;
  }
  .board__row {
    grid-template-columns: 26px minmax(46px, 74px) 1fr 66px;
    gap: 8px;
    padding: 8px 10px;
  }
  .board__delta {
    font-size: 12.5px;
  }
  .transfer {
    grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) 58px;
    gap: 6px;
    padding: 9px 10px;
  }
  .transfer__amount {
    font-size: 13px;
  }
  .tickets {
    padding: 12px 12px 10px;
  }
  .result__tickets-row .ticket-name {
    min-width: 72px;
  }
  .result__footer {
    padding: 10px 14px 12px;
  }
  /* 三个按钮原本被 el-button 的 margin-left 挤到换行，去掉后一行放得下 */
  .result__actions {
    gap: 8px;
  }
  .result__actions .el-button {
    margin-left: 0;
  }
}

/* 320 宽（SE 一代这类）：座位卡一行要同时塞下头像、长名字、段位、盈亏，
   把字号和间距各让一点，5 个字的昵称不至于被截成「老…」 */
@media (max-width: 360px) {
  .seat-row {
    padding: 10px;
    gap: 8px;
  }
  .seat-row__head {
    gap: 6px;
  }
  .seat-row__name {
    font-size: 13px;
  }
  .seat-row__head .tier {
    padding: 0 6px;
    font-size: 11px;
  }
  .seat-row__delta {
    font-size: 12px;
  }
}
</style>

<!-- 下拉浮层挂在 body 上，scoped 选择器够不着，只能全局 -->
<style>
.el-select-dropdown__item .option-parent {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: #c0c4cc;
}
/* 下拉选项里的头像和名字要对齐，不能跟着行高飘 */
.el-select-dropdown__item .option-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}
/* 结算抽屉自己画头部（:with-header="false"），body 必须去内边距，否则头图贴不到边。
   scoped 里用 ::v-deep 试过不生效（element 的 drawer body 有自己的 padding 规则），放全局更稳。 */
.result-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
/* 「清空全部数据」是危险操作，确认按钮染红（MessageBox 也挂 body 上，只能写全局） */
.pk-wipe-confirm .el-message-box__btns .el-button--primary {
  background: #f56c6c;
  border-color: #f56c6c;
}
.pk-wipe-confirm .el-message-box__btns .el-button--primary:hover,
.pk-wipe-confirm .el-message-box__btns .el-button--primary:focus {
  background: #f78989;
  border-color: #f78989;
}
</style>
