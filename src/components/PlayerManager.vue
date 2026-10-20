<template>
  <el-dialog
    title="玩家管理"
    :visible.sync="innerVisible"
    width="780px"
    append-to-body
  >
    <div class="add-bar">
      <div class="add-bar__row">
        <span class="add-bar__count">
          {{ mainCount }} 个主账号 · {{ singleCount }} 个独立号 ·
          {{ subAccountCount }} 个子账号
        </span>
        <el-button
          type="primary"
          size="small"
          icon="el-icon-plus"
          @click="handleAddMain"
          >添加主账号</el-button
        >
      </div>
      <span class="add-bar__hint">
        主账号可以直接上桌，也能在名下挂子账号做积分汇总；独立号自己就能上桌，给它加子账号后自动升级为主账号。
        同一个主账号（它自己 + 名下所有子账号）在任何一局里只能出一个号
      </span>
    </div>

    <el-empty v-if="!players.length" description="还没有任何玩家"></el-empty>

    <!-- 窄屏：表格 5 列最少 585px，操作按钮会被推到屏幕外；换成卡片，动作直接摊在卡里 -->
    <div v-else-if="isMobile" class="pm-list">
      <div v-for="item in players" :key="item.name" class="pm-card">
        <div class="pm-card__head">
          <player-avatar :name="item.name" :avatar="item.avatar" :size="30" />
          <div class="pm-card__id">
            <b class="pm-card__name">{{ item.name }}</b>
            <span class="pm-card__tags">
              <el-tag
                v-if="item.children && item.children.length"
                size="mini"
                type="info"
                >{{ item.children.length }} 个子账号</el-tag
              >
              <el-tag v-else-if="item.isMain === true" size="mini" type="warning"
                >主账号</el-tag
              >
              <el-tag v-else size="mini" type="success">独立号</el-tag>
            </span>
          </div>
          <span class="pm-card__score" :class="scoreClass(item.score)">{{
            format(item.score)
          }}</span>
        </div>
        <div class="pm-card__meta">
          <span>场次 {{ totalGames(item) }}</span>
          <span class="pm-card__acts">
            <el-button type="text" size="mini" @click="handleEditAvatar(item)"
              >头像</el-button
            >
            <el-button type="text" size="mini" @click="handleAddSub(item)"
              >子账号</el-button
            >
            <el-button type="text" size="mini" @click="handleRename(item)"
              >改名</el-button
            >
            <el-button
              type="text"
              size="mini"
              style="color: #f56c6c"
              @click="handleRemove(item)"
              >删除</el-button
            >
          </span>
        </div>
        <div v-if="item.children && item.children.length" class="pm-card__subs">
          <div
            v-for="child in item.children"
            :key="child.name"
            class="pm-sub"
          >
            <div class="pm-sub__head">
              <player-avatar
                :name="child.name"
                :avatar="child.avatar"
                :size="20"
              />
              <span class="pm-sub__name">{{ child.name }}</span>
              <span class="pm-sub__meta">{{ totalGames(child) }} 场</span>
              <span class="pm-sub__score" :class="scoreClass(child.score)">{{
                format(child.score)
              }}</span>
            </div>
            <div class="pm-sub__acts">
              <el-button type="text" size="mini" @click="handleEditAvatar(child)"
                >头像</el-button
              >
              <el-button type="text" size="mini" @click="handleRename(child)"
                >改名</el-button
              >
              <el-button type="text" size="mini" @click="handleDetach(child)"
                >解绑</el-button
              >
              <el-button
                type="text"
                size="mini"
                style="color: #f56c6c"
                @click="handleRemove(child)"
                >删除</el-button
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-table v-else :data="players" size="small" max-height="440">
      <el-table-column type="expand">
        <template slot-scope="scope">
          <div class="sub-list">
            <div v-if="!scope.row.children.length" class="sub-list__empty">
              该主账号下还没有子账号
            </div>
            <el-table
              v-else
              :data="scope.row.children"
              size="mini"
              class="sub-table"
            >
              <el-table-column label="子账号" min-width="130">
                <template slot-scope="child">
                  <span class="cell-name">
                    <player-avatar
                      :name="child.row.name"
                      :avatar="child.row.avatar"
                      :size="22"
                    />
                    {{ child.row.name }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="场次" width="80">
                <template slot-scope="child">
                  {{ totalGames(child.row) }}
                </template>
              </el-table-column>
              <el-table-column label="积分" width="90">
                <template slot-scope="child">
                  <span :class="scoreClass(child.row.score)">{{
                    format(child.row.score)
                  }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="210" align="center">
                <template slot-scope="child">
                  <el-button
                    type="text"
                    size="mini"
                    @click="handleEditAvatar(child.row)"
                    >头像</el-button
                  >
                  <el-button
                    type="text"
                    size="mini"
                    @click="handleRename(child.row)"
                    >改名</el-button
                  >
                  <el-button
                    type="text"
                    size="mini"
                    @click="handleDetach(child.row)"
                    >解绑</el-button
                  >
                  <el-button
                    type="text"
                    size="mini"
                    style="color: #f56c6c"
                    @click="handleRemove(child.row)"
                    >删除</el-button
                  >
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-table-column>

      <el-table-column type="index" width="50" />
      <el-table-column label="主账号" min-width="200">
        <template slot-scope="scope">
          <div class="cell-name">
            <player-avatar
              :name="scope.row.name"
              :avatar="scope.row.avatar"
              :size="26"
            />
            <span class="cell-name__text">{{ scope.row.name }}</span>
            <el-tag
              v-if="scope.row.children.length"
              size="mini"
              type="info"
              class="main-tag"
              >{{ scope.row.children.length }} 个子账号</el-tag
            >
            <el-tag
              v-else-if="scope.row.isMain === true"
              size="mini"
              type="warning"
              class="main-tag"
              >主账号</el-tag
            >
            <el-tag v-else size="mini" type="success" class="main-tag"
              >独立号</el-tag
            >
          </div>
        </template>
      </el-table-column>
      <el-table-column label="场次" width="80">
        <template slot-scope="scope">
          {{ totalGames(scope.row) }}
        </template>
      </el-table-column>
      <el-table-column label="积分" width="90">
        <template slot-scope="scope">
          <span :class="scoreClass(scope.row.score)">{{
            format(scope.row.score)
          }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="215" align="center">
        <template slot-scope="scope">
          <el-button
            type="text"
            size="mini"
            @click="handleEditAvatar(scope.row)"
            >头像</el-button
          >
          <el-button
            type="text"
            size="mini"
            @click="handleAddSub(scope.row)"
            >子账号</el-button
          >
          <el-button type="text" size="mini" @click="handleRename(scope.row)"
            >改名</el-button
          >
          <el-button
            type="text"
            size="mini"
            style="color: #f56c6c"
            @click="handleRemove(scope.row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <div slot="footer" class="pm__footer">
      <el-button
        type="text"
        size="small"
        icon="el-icon-delete-solid"
        class="pm__wipe"
        @click="handleWipe"
        >清空全部数据</el-button
      >
      <el-button @click="innerVisible = false">关闭</el-button>
    </div>
  </el-dialog>
</template>

<script>
import { format } from "../core/money";
import PlayerAvatar from "./PlayerAvatar.vue";
import responsive from "../mixins/responsive";

export default {
  name: "PlayerManager",
  mixins: [responsive],
  components: { PlayerAvatar },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    /** 已按主账号归集过的榜单（每项带 children） */
    players: {
      type: Array,
      default: () => [],
    },
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
    subAccountCount() {
      return this.players.reduce(
        (acc, main) => acc + (main.children ? main.children.length : 0),
        0
      );
    },
    /** 显式创建的主账号：只汇总、不上桌 */
    mainCount() {
      return this.players.filter((main) => main.isMain === true).length;
    },
    /** 未被标记成主账号的顶层账号：自己就能上桌 */
    singleCount() {
      return this.players.filter((main) => main.isMain !== true).length;
    },
    /** 所有账号名（主 + 子），用于重名校验 */
    existingNames() {
      const names = [];
      this.players.forEach((main) => {
        names.push(main.name);
        (main.children || []).forEach((child) => names.push(child.name));
      });
      return names;
    },
  },
  methods: {
    format,
    handleEditAvatar(player) {
      this.$emit("edit-avatar", player.name);
    },
    totalGames(player) {
      const result = player.raceResult || {};
      return (result.win || 0) + (result.lose || 0) + (result.deuce || 0);
    },
    scoreClass(score) {
      const cents = Math.round(Number(score) * 100);
      if (cents > 0) return "score score--win";
      if (cents < 0) return "score score--lose";
      return "score";
    },
    handleAddMain() {
      this.$prompt(
        "主账号只用于汇总积分，不会出现在选人列表里；请在它名下添加子账号上桌",
        "添加主账号",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          inputPlaceholder: "请输入主账号昵称",
          inputValidator: (value) => {
            const name = (value || "").trim();
            if (!name) return "昵称不能为空";
            if (this.existingNames.includes(name)) return "已经存在同名账号了";
            return true;
          },
        }
      )
        .then(({ value }) => {
          this.$emit("add-main", value.trim());
        })
        .catch(() => {});
    },
    handleAddSub(main) {
      const isSingle = main.isMain !== true;
      this.$prompt(
        isSingle
          ? `新子账号的战绩会自动汇总到「${main.name}」名下；加完后「${main.name}」升级为主账号，不再出现在选人列表`
          : `新子账号的战绩会自动汇总到「${main.name}」名下`,
        "添加子账号",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          inputPlaceholder: "请输入子账号昵称",
          inputValidator: (value) => {
            const name = (value || "").trim();
            if (!name) return "昵称不能为空";
            if (this.existingNames.includes(name)) return "已经存在同名账号了";
            return true;
          },
        }
      )
        .then(({ value }) => {
          this.$emit("add-sub", { mainName: main.name, subName: value.trim() });
        })
        .catch(() => {});
    },
    handleRename(player) {
      this.$prompt("修改昵称后，历史流水中的名字会同步更新", "重命名", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        inputValue: player.name,
        inputValidator: (value) => {
          const name = (value || "").trim();
          if (!name) return "昵称不能为空";
          if (name !== player.name && this.existingNames.includes(name)) {
            return "已经存在同名玩家了";
          }
          return true;
        },
      })
        .then(({ value }) => {
          const newName = value.trim();
          if (newName === player.name) return;
          this.$emit("rename", { oldName: player.name, newName });
        })
        .catch(() => {});
    },
    handleDetach(child) {
      this.$confirm(
        `解除后「${child.name}」将变回独立号，战绩不再汇总给上级，自己就能上桌，确认？`,
        "提示",
        { type: "warning" }
      )
        .then(() => {
          this.$emit("detach", child.name);
        })
        .catch(() => {});
    },
    handleRemove(player) {
      const hasChildren = (player.children || []).length > 0;
      const tip = hasChildren
        ? `删除「${player.name}」后，其 ${player.children.length} 个子账号会自动升级为独立号（战绩保留）。确认？`
        : `删除后该账号的排行榜数据将被移除（历史流水保留），确认？`;

      this.$confirm(tip, "提示", { type: "warning" })
        .then(() => {
          this.$emit("remove", player.name);
        })
        .catch(() => {});
    },
    /**
     * 清空全部数据：玩家名册 + 全部流水 + 卡包奖券 + 今日领奖记录（底注设置保留）。
     * 这是不可逆操作，所以二次确认里把会清掉的东西逐项写清楚，别让人误点。
     * 真正的清除与刷新由父组件做（它才知道还有哪些内存态要一起废掉）。
     */
    handleWipe() {
      this.$confirm(
        "将清空：全部玩家名册、全部对局流水、卡包与奖券、今日领奖记录，且无法恢复（底注设置保留）。确认清空？",
        "清空全部数据",
        {
          type: "warning",
          confirmButtonText: "确认清空",
          cancelButtonText: "取消",
          // 危险操作按钮染红（MessageBox 挂 body 上，样式写在 GameDetail 的全局块里）
          customClass: "pk-wipe-confirm",
        }
      )
        .then(() => {
          this.$emit("wipe");
        })
        .catch(() => {});
    },
  },
};
</script>

<style scoped>
.pm__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pm__wipe {
  color: #c0c4cc;
  padding: 0;
}
.pm__wipe:hover {
  color: #f56c6c;
}
.add-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.add-bar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.add-bar__count {
  font-size: 13px;
  font-weight: 600;
}
.add-bar__hint {
  font-size: 12px;
  color: #909399;
}
.main-tag {
  flex: 0 0 auto;
  line-height: 18px;
}
/* 标签放进同一个 flex 容器里居中，避免 inline-flex 基线把标签压到偏下 */
.cell-name {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.cell-name__text {
  line-height: 1;
}
.sub-list {
  padding: 8px 12px 8px 48px;
  background: #fafafa;
}
.sub-list__empty {
  font-size: 12px;
  color: #c0c4cc;
  padding: 6px 0;
}
.sub-table::before {
  height: 0;
}
.score--win {
  color: #f56c6c;
  font-weight: 600;
}
.score--lose {
  color: #67c23a;
  font-weight: 600;
}

/* ---------------- 窄屏卡片列表 ---------------- */
.pm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-card {
  padding: 10px 12px;
  border: 1px solid var(--pk-line);
  border-radius: 12px;
  background: #fff;
}
.pm-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-card__id {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pm-card__name {
  font-size: 14px;
  color: var(--pk-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-card__tags {
  display: flex;
  gap: 4px;
}
.pm-card__score {
  margin-left: auto;
  flex: none;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
/* 场次与动作同一行：左边数字、右边按钮，比表格更省高度 */
.pm-card__meta {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--pk-ink-3);
}
.pm-card__acts {
  display: inline-flex;
  align-items: center;
  flex: none;
}
/* el-button 相邻会加 margin-left，这里统一压成 2px 免得一行放不下 */
.pm-card__acts .el-button,
.pm-sub__acts .el-button {
  margin-left: 0;
  padding: 0 6px;
}
.pm-card__subs {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--pk-surface-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-sub__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.pm-sub__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pk-ink);
}
.pm-sub__meta {
  margin-left: auto;
  flex: none;
  font-size: 11.5px;
  color: var(--pk-ink-3);
}
.pm-sub__score {
  flex: none;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.pm-sub__acts {
  margin-top: 2px;
  display: flex;
  justify-content: flex-end;
}
</style>
