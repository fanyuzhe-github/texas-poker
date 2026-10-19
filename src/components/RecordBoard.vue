<template>
  <div class="records">
    <!-- 荣誉墙：谁霸榜最多 -->
    <div v-if="wall.length" class="wall">
      <span class="wall__label">霸榜之王</span>
      <div class="wall__list">
        <div
          v-for="(item, index) in wall"
          :key="item.name"
          class="wall__item"
          :class="{ 'wall__item--top': index === 0 }"
        >
          <i :class="index === 0 ? 'el-icon-trophy' : 'el-icon-star-on'"></i>
          <span class="wall__name">{{ item.name }}</span>
          <span class="wall__count">{{ item.count }} 项</span>
          <span class="wall__titles">{{ item.titles.join(" · ") }}</span>
        </div>
      </div>
    </div>

    <div v-if="!hasAny" class="records__empty">
      <i class="el-icon-trophy"></i>
      <p>还没有任何记录，打几局就有了</p>
    </div>

    <!-- 三组记录 -->
    <div v-for="group in groups" :key="group.key" class="section">
      <div class="section__head">
        <span class="section__title">{{ group.title }}</span>
        <span class="section__hint">{{ group.hint }}</span>
      </div>

      <div class="grid">
        <div
          v-for="record in group.items"
          :key="record.key"
          class="card"
          :class="`card--${record.tone}`"
        >
          <div class="card__head">
            <i :class="record.icon"></i>
            <span class="card__title">{{ record.title }}</span>
          </div>

          <div v-if="record.leader" class="card__body">
            <span class="card__name">{{ record.leader.name }}</span>
            <span
              :class="['card__value', valueClass(record.tone)]"
              >{{ record.leader.text }}</span
            >
            <span class="card__detail">{{ record.leader.detail }}</span>
          </div>
          <div v-else class="card__body card__body--empty">
            <span class="card__name">虚位以待</span>
            <span class="card__value">—</span>
            <span class="card__detail">{{ record.hint }}</span>
          </div>

          <!-- 挑战者 -->
          <div v-if="record.board.length" class="card__board">
            <div
              v-for="(row, index) in record.board"
              :key="row.name"
              class="board-row"
            >
              <span :class="rankClass(index)">{{ index + 1 }}</span>
              <span class="board-row__name">{{ row.name }}</span>
              <span class="board-row__value">{{ row.text }}</span>
            </div>
          </div>
          <div v-else class="card__hint">{{ record.hint }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  buildRecords,
  buildRecordWall,
  groupRecords,
  rankClass,
  RATE_MIN_GAMES,
} from "../core/records";

export default {
  name: "RecordBoard",
  props: {
    history: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
  },
  computed: {
    records() {
      return buildRecords(this.history, this.players);
    },
    groups() {
      return groupRecords(this.records);
    },
    wall() {
      return buildRecordWall(this.records);
    },
    hasAny() {
      return this.records.some((record) => !!record.leader);
    },
    rateMinGames() {
      return RATE_MIN_GAMES;
    },
  },
  methods: {
    rankClass,
    /** 涨红跌绿：赚钱的记录用红，输光这类亏的记录用绿，胜率用中性蓝 */
    valueClass(tone) {
      if (tone === "up") return "is-up";
      if (tone === "down") return "is-down";
      return "is-neutral";
    },
  },
};
</script>

<style scoped>
.records {
  padding: 0 20px 24px;
}

/* 荣誉墙 */
.wall {
  padding: 12px 16px;
  border-radius: 10px;
  background: linear-gradient(120deg, #fdf6e3, #fff8ea);
  border: 1px solid #f3e3c3;
  margin-bottom: 16px;
}
.wall__label {
  font-size: 12px;
  color: #a1793c;
  font-weight: 600;
}
.wall__list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
.wall__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #f0e2c8;
  font-size: 12px;
  color: #606266;
}
.wall__item i {
  color: #e6a23c;
  font-size: 14px;
}
.wall__item--top {
  border-color: #e6a23c;
  box-shadow: 0 1px 4px rgba(230, 162, 60, 0.24);
}
.wall__name {
  font-weight: 600;
  color: #303133;
  font-size: 13px;
}
.wall__count {
  color: #e6a23c;
  font-weight: 700;
}
.wall__titles {
  color: #a8a29a;
  font-size: 11px;
}

/* 分区 */
.section {
  margin-bottom: 20px;
}
.section__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  padding-left: 2px;
}
.section__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.section__title::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 12px;
  margin-right: 6px;
  border-radius: 2px;
  background: #409eff;
  vertical-align: -1px;
}
.section__hint {
  font-size: 12px;
  color: #a8abb2;
}

/* 记录卡 */
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.card {
  padding: 14px 16px 10px;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  background: #fff;
}
.card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.card__head i {
  font-size: 15px;
}
.card--up .card__head i {
  color: #f5222d;
}
.card--down .card__head i {
  color: #13ce66;
}
.card--neutral .card__head i {
  color: #409eff;
}
.card__title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card__body--empty .card__name {
  color: #c0c4cc;
}
.card__name {
  font-size: 13px;
  color: #606266;
}
.card__value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}
.card__body--empty .card__value {
  color: #dcdfe6;
}
.card__detail {
  font-size: 12px;
  color: #909399;
}
.card__hint {
  margin-top: 8px;
  font-size: 11px;
  color: #c0c4cc;
}

/* 挑战者 */
.card__board {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
}
.board-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #606266;
  padding: 2px 0;
}
.board-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.board-row__value {
  color: #303133;
  font-weight: 600;
}
.rank {
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 4px;
  background: #f4f4f5;
  color: #909399;
  font-size: 11px;
  flex: none;
}
.rank--gold {
  background: #e6a23c;
  color: #fff;
}
.rank--silver {
  background: #b6bbc4;
  color: #fff;
}
.rank--bronze {
  background: #cd7f32;
  color: #fff;
}

/* 颜色：涨红跌绿 */
.is-up {
  color: #f5222d;
}
.is-down {
  color: #13ce66;
}
.is-neutral {
  color: #409eff;
}

.records__empty {
  height: 30vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #909399;
}
.records__empty i {
  font-size: 40px;
  color: #c0c4cc;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
