<template>
  <div class="history">
    <div class="history__toolbar">
      <span class="history__count">
        共 {{ history.length }} 局<template v-if="hasMore">
          · 当前显示最近 {{ visibleCount }} 局</template
        >
      </span>
      <el-button
        type="danger"
        plain
        size="mini"
        icon="el-icon-delete"
        :disabled="!history.length"
        @click="handleClear"
        >清空流水</el-button
      >
    </div>

    <el-empty v-if="!history.length" description="还没有任何对局记录"></el-empty>

    <el-collapse v-else v-model="activeNames" accordion>
      <el-collapse-item
        v-for="game in shown"
        :key="game.id"
        :name="game.id"
      >
        <template slot="title">
          <span class="history__time">{{ formatTime(game.time) }}</span>
          <span class="history__meta">
            {{ game.records.length }} 人 · 底注 {{ format(game.baseChips) }}
          </span>
        </template>

        <el-table :data="game.records" size="mini" style="width: 100%">
          <el-table-column prop="seatNum" label="座位" width="60" />
          <el-table-column prop="name" label="玩家" />
          <el-table-column label="剩余筹码" width="90">
            <template slot-scope="scope">
              {{ format(scope.row.chips) }}
            </template>
          </el-table-column>
          <el-table-column label="盈亏" width="90">
            <template slot-scope="scope">
              <span :class="deltaClass(scope.row.delta)">{{
                formatSigned(scope.row.delta)
              }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="history__transfers">
          <div class="history__transfers-title">转账方案</div>
          <div v-if="!game.transfers.length" class="history__none">
            无需转账
          </div>
          <div
            v-for="(item, index) in game.transfers"
            :key="index"
            class="history__transfer"
          >
            <span class="from">{{ item.from }}</span>
            <span class="arrow">→</span>
            <span class="to">{{ item.to }}</span>
            <span class="amount">{{ format(item.amount) }} 元</span>
          </div>
        </div>

        <div class="history__actions">
          <el-button
            type="text"
            size="mini"
            @click="handleCopy(game)"
            v-if="game.transfers.length"
            >复制方案</el-button
          >
          <el-button type="text" size="mini" @click="handleRemove(game)"
            >删除本局</el-button
          >
        </div>
      </el-collapse-item>
    </el-collapse>

    <div v-if="hasMore" class="history__more">
      <el-button size="mini" plain icon="el-icon-arrow-down" @click="loadMore"
        >加载更早的 {{ nextBatch }} 局</el-button
      >
    </div>
  </div>
</template>

<script>
import { format, formatSigned } from "../core/money";
import { formatTransfers } from "../core/settlement";
import { copyText } from "../core/clipboard";

/** 每次多铺多少局 */
const PAGE_SIZE = 20;

export default {
  name: "HistoryPanel",
  props: {
    history: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      activeNames: "",
      // 只渲染最近的一批。流水不再有 200 局上限，几千局全铺出来
      // 就是几千个 el-table（折叠状态也会渲染），在手机上直接卡死。
      visibleCount: PAGE_SIZE,
    };
  },
  computed: {
    shown() {
      return this.history.slice(0, this.visibleCount);
    },
    hasMore() {
      return this.history.length > this.visibleCount;
    },
    nextBatch() {
      return Math.min(PAGE_SIZE, this.history.length - this.visibleCount);
    },
  },
  methods: {
    format,
    formatSigned,
    loadMore() {
      this.visibleCount += PAGE_SIZE;
    },
    formatTime(time) {
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) return "未知时间";
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
      )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
    deltaClass(delta) {
      const cents = Math.round(Number(delta) * 100);
      if (cents > 0) return "delta delta--win";
      if (cents < 0) return "delta delta--lose";
      return "delta";
    },
    async handleCopy(game) {
      const ok = await copyText(formatTransfers(game.transfers));
      if (ok) {
        this.$message.success("转账方案已复制");
      } else {
        this.$message.error("复制失败，请手动选择文本复制");
      }
    },
    handleRemove(game) {
      this.$confirm(
        "删除后无法恢复，该局计入的积分/场次会同步回滚，确认删除这一局？",
        "提示",
        { type: "warning" }
      )
        .then(() => {
          this.$emit("remove", game.id);
        })
        .catch(() => {});
    },
    handleClear() {
      this.$confirm(
        "将清空全部对局流水，排行榜积分会同步归零（建议先导出备份），确认？",
        "提示",
        { type: "warning" }
      )
        .then(() => {
          this.$emit("clear");
        })
        .catch(() => {});
    },
  },
};
</script>

<style scoped>
.history {
  padding: 0 20px 20px;
}
.history__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.history__count {
  font-size: 13px;
  color: #909399;
}
.history__more {
  padding: 14px 0 4px;
  text-align: center;
}
.history__time {
  font-weight: 600;
  margin-right: 10px;
}
.history__meta {
  font-size: 12px;
  color: #909399;
}
.history__transfers {
  margin-top: 10px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
}
.history__transfers-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.history__none {
  font-size: 13px;
  color: #c0c4cc;
}
.history__transfer {
  font-size: 13px;
  line-height: 1.9;
}
.history__transfer .from {
  color: #67c23a;
}
.history__transfer .to {
  color: #f56c6c;
}
.history__transfer .arrow {
  margin: 0 6px;
  color: #c0c4cc;
}
.history__transfer .amount {
  margin-left: 10px;
  font-weight: 600;
}
.history__actions {
  margin-top: 8px;
  text-align: right;
}
.delta--win {
  color: #f56c6c;
  font-weight: 600;
}
.delta--lose {
  color: #67c23a;
  font-weight: 600;
}
</style>
