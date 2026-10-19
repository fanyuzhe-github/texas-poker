<template>
  <div class="cc">
    <!-- ---------------- 账号切换 + 资源概览 ---------------- -->
    <section class="cc__hero">
      <div class="cc__hero-head">
        <span class="cc__hero-heading">
          <span class="cc__hero-title">我的收藏</span>
          <span class="cc__hero-sub">
            卡包挂在账号上，同一主账号下面的小号共用一套收藏
          </span>
        </span>
        <div class="cc__stats">
          <span class="cc__stat is-ticket">
            <i class="el-icon-present"></i><b>{{ me.tickets }}</b><em>券</em>
          </span>
          <span class="cc__stat">
            <i class="el-icon-s-grid"></i><b>{{ me.shards }}</b><em>碎片</em>
          </span>
          <span class="cc__stat">
            <i class="el-icon-refresh"></i><b>{{ me.pulls }}</b><em>抽</em>
          </span>
          <span class="cc__stat">
            <i class="el-icon-collection"></i><b>{{ dex.percent }}%</b>
            <em>{{ dex.ownedCount }}/{{ dex.total }}</em>
          </span>
        </div>
      </div>

      <div v-if="ownerNames.length" class="cc__owners">
        <button
          v-for="name in ownerNames"
          :key="name"
          type="button"
          class="cc__owner"
          :class="{ 'is-active': name === currentName }"
          @click="pickOwner(name)"
        >
          <player-avatar
            class="cc__owner-avatar"
            :name="name"
            :avatar="avatarOf(name)"
            :size="34"
          />
          <span class="cc__owner-text">
            <span class="cc__owner-name">{{ name }}</span>
            <span class="cc__owner-meta">
              <i class="el-icon-present"></i>{{ cardsOf(name).tickets }} 券
            </span>
          </span>
        </button>
      </div>
      <div v-else class="cc__owners-empty">
        还没有账号，先回牌桌加几个人再来抽卡
      </div>
    </section>

    <el-tabs v-model="tab" class="cc__tabs">
      <!-- ---------------- 抽卡 ---------------- -->
      <el-tab-pane label="抽卡" name="draw">
        <div class="cc__draw-wrap">
          <div class="cc__draw-main">
            <div class="cc__stage">
              <span class="cc__stage-deck" aria-hidden="true">
                <i class="cc__stage-card"></i>
                <i class="cc__stage-card"></i>
                <i class="cc__stage-card"></i>
              </span>
              <div class="cc__stage-text">
                <div class="cc__stage-title">命运的卡池</div>
                <div class="cc__stage-desc">
                  十连必出 3★ 及以上 · 连抽 60 次必出 5★ · 第 50 抽起每抽 +6%
                </div>
              </div>
              <span class="cc__stage-glow" aria-hidden="true"></span>
            </div>

            <div class="cc__pity">
              <div class="cc__pity-row">
                <span class="cc__pity-name">3★ 保底</span>
                <span class="cc__pity-track">
                  <i class="cc__pity-fill" :style="{ width: pity3Percent + '%' }"></i>
                </span>
                <span class="cc__pity-num">再 {{ pity3Left }} 抽</span>
              </div>
              <div class="cc__pity-row">
                <span class="cc__pity-name is-gold">5★ 天井</span>
                <span class="cc__pity-track">
                  <i
                    class="cc__pity-fill is-gold"
                    :style="{ width: pity5Percent + '%' }"
                  ></i>
                </span>
                <span class="cc__pity-num">再 {{ pity5Left }} 抽</span>
              </div>
            </div>

            <div class="cc__buttons">
              <button
                type="button"
                class="cc__draw-btn"
                :disabled="!canDrawOne"
                @click="doDraw(1)"
              >
                <span class="cc__btn-label">单抽</span>
                <span class="cc__btn-cost">{{ costOne }} 券</span>
              </button>
              <button
                type="button"
                class="cc__draw-btn is-main"
                :disabled="!canDrawTen"
                @click="doDraw(10)"
              >
                <span class="cc__btn-label">十连抽</span>
                <span class="cc__btn-cost">{{ costTen }} 券</span>
              </button>
              <span v-if="!currentName" class="cc__draw-need">先在上面选个账号</span>
              <span v-else-if="!canDrawOne" class="cc__draw-need">
                奖券不够，还差 {{ missingOne }} 张
              </span>
            </div>

            <div v-if="lastResults.length" class="cc__result">
              <div class="cc__section-title">
                本次结果
                <em>{{ currentName }} · {{ lastResults.length }} 张</em>
              </div>
              <div class="cc__grid cc__grid--ten">
                <el-tooltip
                  v-for="(item, index) in lastResults"
                  :key="index"
                  :content="item.card.flavor"
                  placement="top"
                >
                  <card-tile
                    :card="item.card"
                    :badge="item.dup ? `+${item.dup} 碎片` : 'NEW'"
                  />
                </el-tooltip>
              </div>
            </div>
            <div v-else class="cc__result-empty">
              <span class="cc__result-empty-mark" aria-hidden="true">♠</span>
              抽到的卡会按稀有度排在这里
            </div>
          </div>

          <aside class="cc__side">
            <div class="cc__panel">
              <div class="cc__panel-title">奖券从哪来</div>
              <div v-for="rule in rules" :key="rule.key" class="cc__rule">
                <span class="cc__rule-label">{{ rule.label }}</span>
                <span class="cc__rule-tickets">+{{ rule.tickets }}</span>
                <span class="cc__rule-hint">{{ rule.hint }}</span>
              </div>
              <div class="cc__rule-tip">
                同一主账号在一局里开多个号，奖券按最有利的那条算，不叠加 ——
                防的就是开小号刷券。
              </div>
            </div>

            <div class="cc__panel">
              <div class="cc__panel-title">出星概率</div>
              <div v-for="odd in starOdds" :key="odd.star" class="cc__odd">
                <span class="cc__odd-star" :class="`is-s${odd.star}`"
                  >{{ odd.star }}★</span
                >
                <span class="cc__odd-track">
                  <i
                    class="cc__odd-fill"
                    :class="`is-s${odd.star}`"
                    :style="{ width: odd.percent + '%' }"
                  ></i>
                </span>
                <span class="cc__odd-num">{{ odd.percent }}%</span>
              </div>
              <div class="cc__rule-tip">重复的卡自动换成碎片，碎片可以在图鉴里合成</div>
            </div>
          </aside>
        </div>
      </el-tab-pane>

      <!-- ---------------- 我的卡包 ---------------- -->
      <el-tab-pane :label="`我的卡包（${dex.ownedCount}）`" name="bag">
        <div class="cc__bar">
          <el-radio-group v-model="starFilter" size="small" class="cc__filter">
            <el-radio-button label="0">
              全部 <em>{{ dex.ownedCount }}/{{ dex.total }}</em>
            </el-radio-button>
            <el-radio-button v-for="s in stars" :key="s" :label="String(s)">
              {{ s }}★ <em>{{ dex.byStar[s].owned }}/{{ dex.byStar[s].total }}</em>
            </el-radio-button>
          </el-radio-group>
        </div>

        <el-empty
          v-if="!bagItems.length"
          description="还没有卡牌，先去抽一发"
        ></el-empty>
        <div v-else class="cc__grid">
          <el-tooltip
            v-for="item in bagItems"
            :key="item.card.id"
            :content="
              item.count > 1
                ? `${item.card.flavor} · 持有 ${item.count} 张`
                : item.card.flavor
            "
            placement="top"
          >
            <card-tile :card="item.card" />
          </el-tooltip>
        </div>
      </el-tab-pane>

      <!-- ---------------- 图鉴 ---------------- -->
      <el-tab-pane :label="`图鉴（${dex.percent}%）`" name="dex">
        <div class="cc__dex-head">
          <div class="cc__dex-ring" :style="ringStyle">
            <span class="cc__dex-ring-num">{{ dex.percent }}<small>%</small></span>
            <span class="cc__dex-ring-label">收集度</span>
          </div>
          <div class="cc__dex-info">
            <div class="cc__dex-title">全息图鉴 · 共 {{ dex.total }} 张</div>
            <div class="cc__dex-stars">
              <span
                v-for="s in stars"
                :key="s"
                class="cc__dex-star"
                :class="`is-s${s}`"
              >
                <b>{{ s }}★</b> {{ dex.byStar[s].owned }}/{{ dex.byStar[s].total }}
              </span>
            </div>
            <div class="cc__dex-tip">
              灰卡可以用碎片合成，碎片来自重复抽到的卡 · 还有
              {{ dex.total - dex.ownedCount }} 张没抓到
            </div>
          </div>
        </div>

        <div class="cc__bar">
          <el-radio-group v-model="starFilter" size="small" class="cc__filter">
            <el-radio-button label="0">
              全部 <em>{{ dex.ownedCount }}/{{ dex.total }}</em>
            </el-radio-button>
            <el-radio-button v-for="s in stars" :key="s" :label="String(s)">
              {{ s }}★ <em>{{ dex.byStar[s].owned }}/{{ dex.byStar[s].total }}</em>
            </el-radio-button>
          </el-radio-group>
          <span class="cc__bar-count">
            当前展示 {{ dexItems.length }} 张 · 碎片够合成
            {{ craftableCount }} 张
          </span>
        </div>

        <div class="cc__grid cc__grid--dex">
          <div v-for="item in dexItems" :key="item.card.id" class="cc__cell">
            <el-tooltip
              :content="
                item.owned
                  ? `${item.card.flavor}${
                      item.count > 1 ? ` · 持有 ${item.count} 张` : ''
                    }`
                  : '还没抓到'
              "
              placement="top"
            >
              <card-tile :card="item.card" :dim="!item.owned" />
            </el-tooltip>
            <div class="cc__cell-action">
              <button
                v-if="!item.owned"
                type="button"
                class="cc__craft"
                :class="{ 'is-ready': me.shards >= craftCost(item.card) }"
                :disabled="me.shards < craftCost(item.card)"
                @click="doCraft(item.card)"
              >
                合成 · {{ craftCost(item.card) }} 碎片
              </button>
              <span v-else class="cc__cell-owned">已收集</span>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <card-draw-stage
      :visible="stageVisible"
      :results="lastResults"
      @close="onStageClose"
    />
  </div>
</template>

<script>
import CardTile from "./CardTile.vue";
import CardDrawStage from "./CardDrawStage.vue";
import PlayerAvatar from "./PlayerAvatar.vue";
import { mainOf } from "../core/ranking";
import {
  STARS,
  PITY_3,
  PITY_5,
  CRAFT_COST,
  STAR_WEIGHT,
  TICKETS_PER_PULL,
  TICKETS_PER_TEN,
  TICKET_RULES,
  normalizeCardState,
  playerCards,
  buildDex,
  drawCards,
  craftCard,
} from "../core/cards";

/**
 * 记住「上次在看谁的卡包」。
 * 用 sessionStorage 而不是 localStorage：卡包选人属于临时视图状态，
 * 不该进备份、也不该跨天黏住；刷新页面还在，关标签页就忘。
 */
const OWNER_KEY = "pk:cardOwner";

function readOwnerName() {
  try {
    return window.sessionStorage.getItem(OWNER_KEY) || "";
  } catch (e) {
    return "";
  }
}

function writeOwnerName(name) {
  try {
    window.sessionStorage.setItem(OWNER_KEY, name || "");
  } catch (e) {
    // 隐私模式写不进去也无所谓，退化成「每次挑券最多的」
  }
}

export default {
  name: "CardCollection",
  components: { CardTile, CardDrawStage, PlayerAvatar },
  props: {
    /** 卡牌存档，可能为空（首次进入） */
    state: { type: Object, default: null },
    /** 全量玩家，用来把上桌的子账号归集到主账号 */
    players: { type: Array, default: () => [] },
    /** 上次看的账号，跨 Tab 切换回来不至于跳回第一个人 */
    owner: { type: String, default: "" },
  },
  data() {
    return {
      tab: "draw",
      currentName: this.owner || readOwnerName(),
      starFilter: "0",
      lastResults: [],
      stageVisible: false,
      pendingMsg: "",
    };
  },
  computed: {
    normState() {
      return normalizeCardState(this.state);
    },
    stars() {
      return STARS;
    },
    rules() {
      return TICKET_RULES;
    },
    costOne() {
      return TICKETS_PER_PULL;
    },
    costTen() {
      return TICKETS_PER_TEN;
    },
    /**
     * 卡包挂在「主账号」上：主账号 + 独立号都能持有卡包，
     * 已经挂在别人名下的子账号不单独持有。
     */
    ownerNames() {
      const roster = Array.isArray(this.players) ? this.players : [];
      const set = new Set();

      roster.forEach((player) => {
        if (!player || !player.name) return;
        const group = mainOf(roster, player.name) || player.name;
        if (group) set.add(group);
      });

      // 存档里已有的名字也要在（玩家可能已经删号，卡包还在）
      Object.keys(this.normState.players || {}).forEach((name) => set.add(name));

      // 不用 localeCompare：中日韩顺序在浏览器与 Node 里不一致
      return Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },
    /** 每个账号的卡包摘要，切换头像排时用得上（券数要露出来） */
    ownerCards() {
      const map = {};
      this.ownerNames.forEach((name) => {
        map[name] = playerCards(this.normState, name);
      });
      return map;
    },
    me() {
      return playerCards(this.normState, this.currentName);
    },
    dex() {
      return buildDex(this.normState, this.currentName);
    },
    dexItems() {
      const star = Number(this.starFilter);
      if (!star) return this.dex.items;
      return this.dex.items.filter((item) => item.card.star === star);
    },
    bagItems() {
      return this.dexItems.filter((item) => item.owned);
    },
    canDrawOne() {
      return Boolean(this.currentName) && this.me.tickets >= this.costOne;
    },
    canDrawTen() {
      return Boolean(this.currentName) && this.me.tickets >= this.costTen;
    },
    missingOne() {
      return Math.max(0, this.costOne - this.me.tickets);
    },
    pity3Left() {
      return Math.max(0, PITY_3 - this.me.pity3);
    },
    pity5Left() {
      return Math.max(0, PITY_5 - this.me.pity5);
    },
    pity3Percent() {
      return Math.round((this.me.pity3 / PITY_3) * 100);
    },
    pity5Percent() {
      return Math.round((this.me.pity5 / PITY_5) * 100);
    },
    /** 收集度进度环：`conic-gradient` 直接按百分比画扇形 */
    ringStyle() {
      return {
        background: `conic-gradient(var(--pk-gold) ${this.dex.percent * 3.6}deg, rgba(255,255,255,.16) 0)`,
      };
    },
    /** 出星概率：权重表里各星占多少，从稀有到普通排 */
    starOdds() {
      const total = Object.values(STAR_WEIGHT).reduce((sum, w) => sum + w, 0);
      return this.stars
        .slice()
        .sort((a, b) => b - a)
        .map((star) => {
          const percent =
            Math.round((STAR_WEIGHT[star] / total) * 1000) / 10;
          return { star, percent };
        });
    },
    /** 图鉴顶部那句「碎片够合成 N 张」，按当前筛选口径算 */
    craftableCount() {
      return this.dexItems.filter(
        (item) => !item.owned && this.me.shards >= this.craftCost(item.card)
      ).length;
    },
  },
  watch: {
    owner(value) {
      if (value && value !== this.currentName) this.currentName = value;
    },
    ownerNames: {
      immediate: true,
      handler(list) {
        if (this.currentName && list.includes(this.currentName)) {
          // 初始就命中也要落一次：immediate 执行时 currentName 自己的 watcher
          // 还没创建，靠 watcher 回写会漏
          writeOwnerName(this.currentName);
          return;
        }
        // 存档里记着的那个人优先（刷新 / 关掉再开都还是他）
        const saved = readOwnerName();
        if (saved && list.includes(saved)) {
          this.currentName = saved;
          writeOwnerName(saved);
          return;
        }
        // 否则挑券最多的：手里有券才抽得动，选个空号只会让人以为坏了
        const best = list.slice().sort((a, b) => {
          const diff =
            playerCards(this.normState, b).tickets -
            playerCards(this.normState, a).tickets;
          return diff || (a < b ? -1 : a > b ? 1 : 0);
        });
        this.currentName = best[0] || "";
        writeOwnerName(this.currentName);
        this.$emit("owner-change", this.currentName);
      },
    },
    currentName(value) {
      writeOwnerName(value);
      if (value !== this.owner) this.$emit("owner-change", value);
    },
  },
  methods: {
    craftCost(card) {
      return CRAFT_COST[card.star] || 0;
    },
    cardsOf(name) {
      return this.ownerCards[name] || { tickets: 0, shards: 0, pulls: 0 };
    },
    avatarOf(name) {
      const hit = (this.players || []).find((item) => item && item.name === name);
      return hit ? hit.avatar : "";
    },
    pickOwner(name) {
      if (name === this.currentName) return;
      this.currentName = name;
      // 换了人就把上一次的结果收起来，别看着别人的十连
      this.lastResults = [];
    },
    doDraw(count) {
      if (!this.currentName) {
        this.$message.warning("先在上面选个账号");
        return;
      }

      const result = drawCards(this.normState, this.currentName, count);
      if (!result.ok) {
        this.$message.warning(
          `奖券不够，这一抽需要 ${result.need} 张（当前 ${this.me.tickets} 张）`
        );
        return;
      }

      this.lastResults = result.results;
      this.$emit("update", result.state);
      this.stageVisible = true;

      // 演出结束后再提示，免得 message 压在滚动的稀有包上面
      const best = result.results.reduce(
        (top, item) => (item.star > top.star ? item : top),
        result.results[0]
      );
      this.pendingMsg =
        best.star >= 4
          ? `${this.currentName} 抽到了 ${best.star}★ ${best.card.name}！`
          : "";
    },
    onStageClose() {
      this.stageVisible = false;
      if (this.pendingMsg) {
        this.$message.success(this.pendingMsg);
        this.pendingMsg = "";
      }
    },
    doCraft(card) {
      const result = craftCard(this.normState, this.currentName, card.id);
      if (!result.ok) {
        this.$message.warning(result.reason || "合成失败");
        return;
      }
      this.$emit("update", result.state);
      this.$message.success(`已合成 ${card.name}`);
    },
  },
};
</script>

<style scoped>
.cc {
  padding: 0 2px 8px;
}

/* ---------------- 账号切换 ---------------- */
.cc__hero {
  padding: 16px 18px;
  margin-bottom: 16px;
  border-radius: var(--pk-radius-lg);
  border: 1px solid var(--pk-line);
  background: linear-gradient(170deg, #fbfcff 0%, #f4f7fd 100%);
}
.cc__hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}
.cc__hero-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.cc__hero-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pk-ink);
}
.cc__hero-sub {
  font-size: 12px;
  color: var(--pk-ink-3);
}
/* 资源条：贴着标题行右侧，像游戏的资源栏，不额外占一块高度 */
.cc__stats {
  flex: none;
  display: flex;
  align-items: center;
  padding: 3px 4px;
  border-radius: 11px;
  background: #fff;
  border: 1px solid var(--pk-line);
}
.cc__stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 10px;
}
.cc__stat + .cc__stat {
  border-left: 1px solid var(--pk-line);
}
.cc__stat i {
  font-size: 12px;
  color: var(--pk-ink-3);
}
.cc__stat b {
  font-size: 16px;
  font-weight: 600;
  color: var(--pk-ink);
  font-variant-numeric: tabular-nums;
}
.cc__stat em {
  font-style: normal;
  font-size: 11px;
  color: var(--pk-ink-3);
}
.cc__stat.is-ticket b {
  color: var(--pk-gold);
}
.cc__owners {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 8px;
}
.cc__owners::-webkit-scrollbar {
  height: 6px;
}
.cc__owners::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--pk-line-strong);
}
.cc__owner {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 14px 8px 8px;
  border: 1px solid var(--pk-line);
  border-radius: 12px;
  background: #fff;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.16s, box-shadow 0.16s, transform 0.16s;
}
.cc__owner:hover {
  transform: translateY(-1px);
  border-color: #c9d4ea;
}
.cc__owner.is-active {
  border-color: var(--pk-primary);
  background: var(--pk-primary-soft);
  box-shadow: 0 0 0 3px rgba(58, 85, 200, 0.1);
}
.cc__owner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.cc__owner-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--pk-ink);
  white-space: nowrap;
}
.cc__owner-meta {
  font-size: 12px;
  color: var(--pk-gold);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.cc__owner-meta i {
  font-size: 11px;
}
.cc__owners-empty {
  padding: 14px;
  text-align: center;
  font-size: 13px;
  color: var(--pk-ink-3);
  border: 1px dashed var(--pk-line-strong);
  border-radius: 12px;
}

/* ---------------- 抽卡区 ---------------- */
.cc__draw-wrap {
  display: grid;
  /* 右栏给固定宽：左栏要装下 5 张 179 的卡，不能再被 fr 抢走 */
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  align-items: start;
}
.cc__draw-main {
  min-width: 0;
}
.cc__stage {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 132px;
  padding: 20px 22px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--pk-navy-2), var(--pk-navy-1));
  color: #fff;
}
/* 三张斜叠的卡背，比一个方块图标更像「卡池」 */
.cc__stage-deck {
  position: relative;
  flex: none;
  width: 88px;
  height: 66px;
}
.cc__stage-card {
  position: absolute;
  top: 3px;
  left: 12px;
  width: 42px;
  height: 58px;
  border-radius: 6px;
  border: 1px solid rgba(244, 223, 174, 0.4);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04));
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.26);
  transform-origin: 50% 100%;
}
.cc__stage-card::after {
  content: "♠";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: rgba(244, 223, 174, 0.52);
}
.cc__stage-card:nth-child(1) {
  transform: rotate(-15deg) translateX(-10px);
}
.cc__stage-card:nth-child(2) {
  transform: rotate(-2deg) translateX(8px);
}
.cc__stage-card:nth-child(3) {
  transform: rotate(11deg) translateX(26px);
}
.cc__stage-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.cc__stage-desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}
/* 右上角一小片金光，纯装饰 */
.cc__stage-glow {
  position: absolute;
  top: -40px;
  right: -30px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(244, 223, 174, 0.28) 0%, rgba(244, 223, 174, 0) 70%);
  pointer-events: none;
}

.cc__pity {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--pk-surface-2);
  border: 1px solid var(--pk-line);
  display: grid;
  gap: 10px;
}
.cc__pity-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cc__pity-name {
  flex: none;
  width: 58px;
  font-size: 12px;
  color: var(--pk-ink-2);
}
.cc__pity-name.is-gold {
  color: var(--pk-gold);
}
.cc__pity-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.cc__pity-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #9db2e8, var(--pk-primary));
  transition: width 0.3s ease;
}
.cc__pity-fill.is-gold {
  background: linear-gradient(90deg, #f0c78a, var(--pk-gold));
}
.cc__pity-num {
  flex: none;
  min-width: 56px;
  text-align: right;
  font-size: 12px;
  color: var(--pk-ink-3);
  font-variant-numeric: tabular-nums;
}

.cc__buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.cc__draw-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 152px;
  padding: 12px 0;
  border: 1px solid var(--pk-line-strong);
  border-radius: 12px;
  background: #fff;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.16s, box-shadow 0.16s, border-color 0.16s;
}
.cc__draw-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--pk-primary);
  box-shadow: var(--pk-shadow-1);
}
.cc__draw-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.cc__draw-btn.is-main {
  border-color: transparent;
  background: linear-gradient(140deg, #f0c78a, var(--pk-gold));
  color: #fff;
}
.cc__btn-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--pk-ink);
}
.cc__draw-btn.is-main .cc__btn-label {
  color: #fff;
}
.cc__btn-cost {
  font-size: 12px;
  color: var(--pk-ink-3);
}
.cc__draw-btn.is-main .cc__btn-cost {
  color: rgba(255, 255, 255, 0.82);
}
.cc__draw-need {
  font-size: 12px;
  color: #d48806;
}

.cc__result {
  margin-top: 18px;
}
/* 没抽之前留一块虚线占位：一栏到底不会突然空出一大片 */
.cc__result-empty {
  margin-top: 16px;
  min-height: 126px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--pk-line-strong);
  border-radius: 14px;
  font-size: 12px;
  color: var(--pk-ink-3);
  background: linear-gradient(180deg, rgba(247, 249, 253, 0.7), rgba(255, 255, 255, 0));
}
.cc__result-empty-mark {
  font-size: 22px;
  color: var(--pk-line-strong);
}
.cc__section-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--pk-ink);
  margin-bottom: 10px;
}
.cc__section-title em {
  font-style: normal;
  font-size: 12px;
  font-weight: 400;
  color: var(--pk-ink-3);
}

/* ---------------- 侧栏 ---------------- */
.cc__side {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.cc__panel {
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--pk-surface-2);
  border: 1px solid var(--pk-line);
}
.cc__panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pk-ink);
  margin-bottom: 8px;
}
.cc__rule {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.8;
}
.cc__rule-label {
  flex: none;
  width: 106px;
  color: var(--pk-ink-2);
}
.cc__rule-tickets {
  flex: none;
  min-width: 26px;
  text-align: center;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #a4701a;
  background: #fdf3e0;
}
.cc__rule-hint {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--pk-ink-3);
}
.cc__rule-tip {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--pk-line);
  font-size: 12px;
  line-height: 1.7;
  color: var(--pk-ink-3);
}

.cc__odd {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 2;
}
.cc__odd-star {
  flex: none;
  width: 26px;
  font-size: 12px;
  letter-spacing: -1px;
}
.cc__odd-star.is-s5 { color: #ef9f27; }
.cc__odd-star.is-s4 { color: #7f77dd; }
.cc__odd-star.is-s3 { color: #378add; }
.cc__odd-star.is-s2 { color: #639922; }
.cc__odd-star.is-s1 { color: #888780; }
.cc__odd-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.cc__odd-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
}
.cc__odd-fill.is-s5 { background: #ef9f27; }
.cc__odd-fill.is-s4 { background: #7f77dd; }
.cc__odd-fill.is-s3 { background: #378add; }
.cc__odd-fill.is-s2 { background: #639922; }
.cc__odd-fill.is-s1 { background: #b8b5ad; }
.cc__odd-num {
  flex: none;
  width: 40px;
  text-align: right;
  font-size: 12px;
  color: var(--pk-ink-3);
  font-variant-numeric: tabular-nums;
}

/* ---------------- 卡包 / 图鉴 ---------------- */
.cc__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
/* 筛选按钮里带一份收集进度：统计和筛选合成一条，省掉一排重复的胶囊 */
.cc__bar ::v-deep .el-radio-button__inner em {
  font-style: normal;
  margin-left: 4px;
  font-size: 11px;
  color: var(--pk-ink-3);
}
.cc__bar ::v-deep .el-radio-button__orig-radio:checked + .el-radio-button__inner em {
  color: rgba(255, 255, 255, 0.78);
}
.cc__dex-stars {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cc__dex-star {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--pk-surface-2);
  border: 1px solid var(--pk-line);
  color: var(--pk-ink-2);
}
.cc__dex-star b {
  color: var(--pk-ink);
}
.cc__dex-star.is-s5 { color: #a4701a; background: #fdf6e9; border-color: #f2e2c2; }
.cc__dex-star.is-s4 { color: #534ab7; background: #f1f0fe; border-color: #dedbfb; }
.cc__dex-star.is-s3 { color: #185fa5; background: #eaf2fc; border-color: #cfe2f7; }
.cc__dex-star.is-s2 { color: #3b6d11; background: #eef5e6; border-color: #d9e9cb; }
.cc__dex-star.is-s1 { color: #5f5e5a; background: #f4f3ef; border-color: #e6e4dc; }
.cc__bar-count {
  font-size: 12px;
  color: var(--pk-ink-3);
}

.cc__dex-head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 18px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--pk-navy-2), var(--pk-navy-1));
  color: #fff;
}
.cc__dex-ring {
  flex: none;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}
/* 中间挖空，把扇形变成进度环 */
.cc__dex-ring::after {
  content: "";
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: linear-gradient(135deg, #31486f, #1b2942);
}
.cc__dex-ring-num,
.cc__dex-ring-label {
  position: relative;
  z-index: 1;
}
.cc__dex-ring-num {
  font-size: 22px;
  font-weight: 600;
  color: #f4dfae;
  font-variant-numeric: tabular-nums;
}
.cc__dex-ring-num small {
  font-size: 12px;
  margin-left: 1px;
}
.cc__dex-ring-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
.cc__dex-title {
  font-size: 15px;
  font-weight: 600;
}
.cc__dex-info .cc__dex-stars {
  margin: 8px 0;
}
.cc__dex-info .cc__dex-star {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.82);
}
.cc__dex-info .cc__dex-star b {
  color: #f4dfae;
}
.cc__dex-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.cc__cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cc__cell-action {
  text-align: center;
  min-height: 28px;
}
.cc__craft {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--pk-line-strong);
  background: #fff;
  color: var(--pk-ink-3);
  font-family: inherit;
  font-size: 12px;
  cursor: not-allowed;
  transition: all 0.16s;
}
.cc__craft.is-ready {
  border-color: #f0c78a;
  background: linear-gradient(140deg, #fdf6e9, #fff);
  color: #a4701a;
  cursor: pointer;
}
.cc__craft.is-ready:hover {
  border-color: var(--pk-gold);
  box-shadow: 0 2px 8px rgba(195, 144, 47, 0.18);
}
.cc__cell-owned {
  font-size: 12px;
  color: #67c23a;
  line-height: 28px;
}

/* ---------------- 卡网格 ---------------- */
.cc__grid {
  display: grid;
  /* 目标尺寸 179×239（对齐用户给的设计图），一行 6 张 = 6×179 + 5×15 = 1149。
     容器不够时只缩到 170（-5%），不会掉列；再窄才掉列，且卡不再变形 */
  grid-template-columns: repeat(auto-fill, minmax(170px, 179px));
  justify-content: center;
  gap: 15px;
}
/* 图鉴与卡包保持同宽，否则两页切换时卡会跳一下 */
.cc__grid--dex {
  grid-template-columns: repeat(auto-fill, minmax(170px, 179px));
}
/* 十连结果固定 5 列：10 张刚好 5+5 对称。走 6 列会排成 6+4，右下角空两格很难看 */
.cc__grid--ten {
  grid-template-columns: repeat(5, minmax(0, 179px));
}

@media (max-width: 1180px) {
  .cc__draw-wrap {
    grid-template-columns: minmax(0, 1fr);
  }
  .cc__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 960px) {
  .cc__hero-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .cc__hero-sub {
    display: none;
  }
  .cc__side {
    grid-template-columns: minmax(0, 1fr);
  }
  .cc__rule-hint {
    display: none;
  }
}
</style>
