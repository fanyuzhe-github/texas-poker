<template>
  <div class="detail">
    <div class="operation-button">
      <el-button
        type="success"
        plain
        @click="resetSeat()"
        >开局选座</el-button
      >
      <el-button
        type="danger"
        plain
        >结束游戏</el-button
      >
    </div>
    <div class="content">
      <el-row :gutter="20">
        <el-col :span="16">
          <el-table
            :data="playersSort"
            stripe
            style="width: 100%"
          >
            <el-table-column
              prop="seatNum"
              label="座位号"
              width="180"
            >
            </el-table-column>
            <el-table-column
              prop="name"
              label="玩家"
              width="180"
            >
            </el-table-column>
            <el-table-column
              prop="chips"
              label="剩余筹码"
            >
              <template slot-scope="scope"
                ><el-input-number
                  v-model="scope.row.chips"
                  :precision="2"
                  :step="0.1"
                ></el-input-number>
              </template>
            </el-table-column>
          </el-table>
          <div
            class="account-button"
            v-if="this.playersSort.length !== 0"
          >
            <el-button
              type="primary"
              round
              @click="settleAccount"
              >结算本局</el-button
            >
            <el-switch
              v-model="humaneModel"
              active-text="人道模式结算"
              style="float: right"
            >
            </el-switch>
          </div>
        </el-col>
        <el-col :span="8">
          <el-card class="box-card">
            <div
              slot="header"
              class="clearfix"
              style="text-align: center; color: blueviolet; font-weight: bold"
            >
              <span>今日排行榜</span>
            </div>
            <el-table
              :data="players"
              style="width: 100%"
            >
              <el-table-column
                type="index"
                width="50"
              >
              </el-table-column>
              <el-table-column
                prop="name"
                label="玩家"
                width="180"
              >
              </el-table-column>
              <el-table-column
                prop="score"
                label="分数"
              >
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </div>
    <el-drawer
      title="结算明细"
      :visible.sync="drawer"
      direction="rtl"
      :before-close="handleClose"
    >
      <template v-if="resultInfo.length !== 0">
        <el-result icon="success"></el-result>
        <div
          v-for="(info, index) in resultInfo"
          :key="index"
          style="margin-bottom: 10px"
        >
          <span style="margin-left: 20px">{{ info }}</span>
          <el-divider></el-divider>
        </div>
      </template>
      <el-result
        v-else
        icon="info"
        title="无需转账操作"
      ></el-result>
    </el-drawer>
  </div>
</template>
<script>
import { Player } from '../core/Player';
import { cloneDeep } from 'lodash-es';

export default {
  props: ['playersName'],
  data() {
    return {
      players: [],
      playersSort: [],
      drawer: false,
      baseChips: 10,
      resultInfo: [],
      humaneModel: false,
    };
  },
  created() {
    this.playersName.forEach((name, index) => {
      this.players.push(this.createPlayer(index, name));
    });
  },
  methods: {
    createPlayer(seatNum, name) {
      const chips = this.baseChips;
      const raceResult = 'deuce';
      const raceDate = new Date().getTime();
      const winnerTimes = 0;
      const score = 0;
      const isPlaying = false;
      return new Player(seatNum, name, chips, raceResult, raceDate, winnerTimes, score, isPlaying);
    },
    resetSeat() {
      this.playersSort = [];

      // 生成一个随机数组
      const randomArr = this.shuffle(this.playersName.map((item, index) => index + 1));
      this.playersSort = cloneDeep(this.players).map((player, index) => {
        player.seatNum = randomArr[index]; // 重置座位
        player.chips = this.baseChips; // 重置筹码
        return player;
      });
      // 按升序排列
      this.playersSort.sort((a, b) => a.seatNum - b.seatNum);
    },
    settleAccount() {
      const inputChips = this.playersSort.map((player) => player.chips).reduce((a, b) => a + b);
      const correctChips = this.baseChips * this.playersSort.length;
      console.log(inputChips, correctChips);
      if (inputChips === correctChips) {
        this.$confirm('结算前请填写好玩家的剩余筹码, 是否继续结算?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        })
          .then(() => {
            this.outputResult();
          })
          .catch(() => {});
      } else {
        const diffChips = correctChips - inputChips;
        this.$message.error(
          `输入的剩余筹码总额为${inputChips}，${diffChips > 0 ? '少' : '多'}于总筹码${Math.abs(
            diffChips
          )}, 请先确认剩余筹码后再进行结算`
        );
      }
    },
    outputResult() {
      this.drawer = true;
      const winners = [];
      const losers = [];
      this.playersSort.forEach((player) => {
        player['actualChips'] = ((player.chips * 100 - this.baseChips * 100) / 100).toFixed(2);
        if (player.actualChips > 0) {
          player.raceResult = 'win';
          winners.push(cloneDeep(player));
        } else if (player.actualChips < 0) {
          player.raceResult = 'lose';
          losers.push(cloneDeep(player));
        } else {
          player.raceResult = 'deuce';
        }
      });
      this.allot(winners, losers);
    },
    allot(winners, losers) {
      // 给winners降序排序
      winners.sort((a, b) => b.actualChips - a.actualChips);
      if (this.humaneModel) {
        // 给losers降序排列（人道模式）
        losers.sort((a, b) => a.actualChips - b.actualChips);
      } else {
        losers.sort((a, b) => b.actualChips - a.actualChips);
        if (losers[0].actualChips === 0) {
          losers.splice(0, 1);
        }
      }
      if (winners[0].actualChips === 0) {
        return;
      } else {
        const tolerance =
          Math.abs(winners[0].actualChips) - Math.abs(losers[0].actualChips) <= 0
            ? Math.abs(winners[0].actualChips)
            : Math.abs(losers[0].actualChips); // 转账的公差
        winners[0].actualChips = (winners[0].actualChips * 100 - tolerance * 100) / 100; // 解决js小数精度问题
        losers[0].actualChips = (losers[0].actualChips * 100 + tolerance * 100) / 100;
        const outputInfo = `${losers[0].name} 向 ${winners[0].name} 转账 ${tolerance}元`;
        this.resultInfo.push(outputInfo);
        // console.log(winners, losers);
        this.allot(winners, losers);
      }
    },
    handleClose(done) {
      this.$confirm('确认关闭？')
        .then(() => {
          done();
          this.resultInfo = []; // 情况转账消息列表
          // 更新排行榜
          // const rankingList =
          console.log(this.playersSort);
          this.players.forEach((player) => {
            const playerActualChips = this.playersSort.find(
              (p) => player.name === p.name
            ).actualChips;
            player.score = parseFloat(playerActualChips) + player.score;
          });
          this.playersSort = [];
          this.players.sort((a, b) => b.score - a.score);
          console.log();
        })
        .catch(() => {});
    },
    shuffle(array) {
      // 洗牌算法
      var j, x, i;
      for (i = array.length; i; i--) {
        j = Math.floor(Math.random() * i);
        x = array[i - 1];
        array[i - 1] = array[j];
        array[j] = x;
      }
      return array;
    },
  },
};
</script>
<style scoped>
.operation-button {
  padding: 20px;
  display: flex;
  justify-content: space-between;
}
.el-table .warning-row {
  background: oldlace;
}

.el-table .success-row {
  background: #f0f9eb;
}
.content {
  padding: 0 20px;
}
.account-button {
  text-align: center;
  margin-top: 20px;
}
</style>
