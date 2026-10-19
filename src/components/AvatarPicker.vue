<template>
  <el-dialog
    title="设置头像"
    :visible.sync="innerVisible"
    width="520px"
    append-to-body
    class="ap"
  >
    <div v-if="player" class="ap__body">
      <div class="ap__preview">
        <player-avatar :name="player.name" :avatar="current" :size="64" />
        <div class="ap__meta">
          <div class="ap__name">{{ player.name }}</div>
          <div class="ap__hint">
            {{
              current
                ? currentLabel
                : "当前是默认头像（昵称首字 + 固定配色）"
            }}
          </div>
        </div>
      </div>

      <div class="ap__section">
        <div class="ap__label">
          我的卡牌头像
          <span class="ap__count">{{ unlocked }} / {{ total }}</span>
        </div>
        <div class="ap__tip">
          这里只列出你抽到或碎片合成过的卡（{{ owner }} 的卡包），抽到新的会自动加进来；头像外环按稀有度变化。
        </div>
        <div v-if="!options.length" class="ap__empty">
          还没有卡牌头像 —— 去「卡牌收藏」抽一张，抽到就能拿来当头像。
        </div>
        <div v-else class="ap__grid">
          <button
            v-for="item in options"
            :key="item.id"
            type="button"
            class="ap__cell"
            :class="{ 'is-active': current === item.id }"
            :title="
              `${item.name} · ${item.star}★ ${item.type}${
                item.legacy ? '（当前使用，已不在卡包里）' : ''
              }`
            "
            @click="pick(item.id)"
          >
            <player-avatar :name="item.name" :avatar="item.id" :size="42" />
          </button>
        </div>
      </div>

      <div class="ap__section">
        <div class="ap__label">自定义</div>
        <div class="ap__upload">
          <el-button size="small" icon="el-icon-upload2" @click="pickFile"
            >上传本地图片</el-button
          >
          <el-button
            size="small"
            icon="el-icon-refresh-left"
            :disabled="!current"
            @click="resetDefault"
            >恢复默认</el-button
          >
          <span class="ap__tip">上传的图会自动裁成正方形并压缩</span>
          <input
            ref="file"
            type="file"
            accept="image/*"
            class="ap__file"
            @change="onFileChange"
          />
        </div>
      </div>
    </div>

    <div slot="footer">
      <el-button type="primary" size="small" @click="innerVisible = false"
        >完成</el-button
      >
    </div>
  </el-dialog>
</template>

<script>
import PlayerAvatar from "./PlayerAvatar.vue";
import { playerCards } from "../core/cards";
import { CARD_TOTAL } from "../core/cardPool";
import {
  CARD_PREFIX,
  avatarCardOf,
  avatarCardOptions,
  cardAvatarValue,
  countUnlockedAvatars,
  normalizeAvatar,
  resolveAvatar,
  fileToAvatarDataUrl,
} from "../core/avatar";

/**
 * 头像选择器：卡牌头像（抽到才解锁）+ 本地上传 + 恢复默认。
 * 点选即生效（直接 emit），不做「取消还原」——玩家想再改随时能回来，
 * 少一层确认比多一步后悔更符合实际使用。
 *
 * 卡包挂在**主账号**上，所以子账号看的是它主账号的收藏
 * （`player.parent || player.name`），跟卡牌收藏页口径一致。
 */
export default {
  name: "AvatarPicker",
  components: { PlayerAvatar },
  props: {
    visible: { type: Boolean, default: false },
    /** 正在编辑的玩家对象（带 name / avatar / parent） */
    player: { type: Object, default: null },
    /** 卡牌存档，用来判断解锁了哪些卡；不传就是全新号（只有 1★） */
    cardState: { type: Object, default: null },
  },
  data() {
    return { uploading: false };
  },
  computed: {
    innerVisible: {
      get() {
        return this.visible;
      },
      set(value) {
        this.$emit("update:visible", value);
      },
    },
    current() {
      return normalizeAvatar(this.player && this.player.avatar);
    },
    /** 预览区下面那行小字：卡牌头像要说明是哪张卡 */
    currentLabel() {
      const resolved = resolveAvatar(this.current);
      if (resolved.kind === "card") {
        return `${resolved.cardName} · ${resolved.star}★ · 选「恢复默认」可回到昵称色块`;
      }
      return "已设置头像，选「恢复默认」可回到昵称色块";
    },
    /** 卡包所属：子账号用主账号，独立号用自己 */
    cardOwner() {
      if (!this.player) return "";
      return this.player.parent || this.player.name;
    },
    owned() {
      return playerCards(this.cardState, this.cardOwner).owned;
    },
    /**
     * 只显示真拥有的卡：卡包里几张就是几个头像，没抽到的不占位、也不灰显。
     * 唯一例外是**当前正在用的那张**——即使它已不在卡包里（历史遗留），
     * 也要留在列表里，否则会出现「正用着却在列表里找不到」。
     */
    options() {
      const list = avatarCardOptions(this.owned).filter((item) => !item.locked);
      const held = list.some((item) => item.id === this.current);
      if (held || this.current.indexOf(CARD_PREFIX) !== 0) return list;

      const card = avatarCardOf(this.current);
      if (!card) return list;
      return list.concat([
        {
          id: cardAvatarValue(card.id),
          cardId: card.id,
          code: card.code,
          name: card.name,
          star: card.star,
          type: card.type,
          locked: false,
          legacy: true,
        },
      ]);
    },
    unlocked() {
      return countUnlockedAvatars(this.owned);
    },
    total() {
      return CARD_TOTAL;
    },
  },
  methods: {
    pick(avatar) {
      this.emitChange(avatar);
    },
    resetDefault() {
      this.emitChange("");
    },
    pickFile() {
      const input = this.$refs.file;
      if (input) input.click();
    },
    async onFileChange(event) {
      const input = event.target;
      const file = input.files && input.files[0];
      input.value = ""; // 清空，同一个文件可以连选两次
      if (!file || this.uploading) return;

      this.uploading = true;
      try {
        const dataUrl = await fileToAvatarDataUrl(file);
        this.emitChange(dataUrl);
        this.$message.success("头像已更新");
      } catch (error) {
        this.$message.error(error.message || "图片处理失败，换一张试试");
      } finally {
        this.uploading = false;
      }
    },
    emitChange(avatar) {
      if (!this.player) return;
      this.$emit("change", { name: this.player.name, avatar });
    },
  },
};
</script>

<style scoped>
.ap__body {
  padding-top: 2px;
}
.ap__preview {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  background: #f7f8fb;
  border-radius: 10px;
}
.ap__name {
  font-size: 15px;
  font-weight: 600;
}
.ap__hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.ap__section {
  margin-top: 16px;
}
.ap__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #303133;
}
.ap__count {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.ap__tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  margin-bottom: 8px;
}
.ap__empty {
  padding: 18px 14px;
  border: 1px dashed #dcdfe6;
  border-radius: 10px;
  background: #fafbfc;
  font-size: 12px;
  color: #909399;
  line-height: 1.7;
  text-align: center;
}
.ap__grid {
  display: grid;
  /* 列宽与 .ap__cell 外框同宽：border 吃在 46px 里，头像正好居中不越界 */
  grid-template-columns: repeat(8, 46px);
  justify-content: center;
  gap: 8px;
  /**
   * hover 会把头像放大到 1.08（46px → 49.7px），每边多出约 1.8px。
   * 外层留 6px 内边距把这部分吃掉，否则放大瞬间撑出滚动区、滚动条闪现，
   * 列宽被挤掉 10px 导致整排左移，hover 随之断开 —— 就是「点头像就抖」的根因。
   *
   * 注意：这里**不做**内部滚动（早先 max-height + overflow-y:auto 是抖动源头之一），
   * 卡片多了统一交给弹窗内容区滚，只保留一条滚动条。
   */
  padding: 6px;
}
.ap__cell {
  box-sizing: border-box;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  line-height: 0;
  outline: none;
  transition: transform 0.15s ease;
}
.ap__cell:hover {
  transform: scale(1.08);
}
.ap__cell:focus-visible {
  outline: 2px solid #409eff;
  outline-offset: 2px;
}
.ap__cell.is-active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.18);
}
.ap__upload {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ap__file {
  display: none;
}
</style>

<style>
/**
 * 弹窗限高：卡片多时（71 张全解锁约 745px）在窄屏上会顶出视口，
 * 整个 wrapper 出滚动条 → 居中的弹窗被推偏。
 * 改成「头部/底部固定 + 内容区自己滚」，弹窗高度封顶，位置不再变；
 * 54 = 15vh 上边距 + 50px 下边距 + 少量余量，保证外层永远不需要滚。
 */
.el-dialog__wrapper.ap .el-dialog {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 15vh - 62px);
}
.el-dialog__wrapper.ap .el-dialog__header,
.el-dialog__wrapper.ap .el-dialog__footer {
  flex: none;
}
.el-dialog__wrapper.ap .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* 滚动条槽位常驻（两侧对称预留）：内容高度变化时列宽不跳，居中也仍然对称 */
  scrollbar-gutter: stable both-edges;
}
</style>
