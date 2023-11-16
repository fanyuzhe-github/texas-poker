<template>
  <div class="detail">
    <div class="operation-button">
      <el-button
        :type="isPlaying ? 'primary' : 'success'"
        plain
        @click="resetSeat()"
        :disabled="isPlaying"
        :icon="isPlaying ? 'el-icon-basketball' : 'el-icon-guide'"
        >{{ isPlaying ? '游戏中...' : '开局选座' }}</el-button
      >
      <el-select
        v-model="selectPlayers"
        class="select-players"
        multiple
        filterable
        allow-create
        :disabled="isPlaying"
        default-first-option
        placeholder="请选择或添加玩家"
      >
        <el-option
          v-for="(item, index) in playerOptions"
          :key="index"
          :label="item"
          :value="item"
        >
        </el-option>
      </el-select>
      <el-button
        type="info"
        plain
        icon="el-icon-s-data"
        @click="scoreboardDrawer = true"
        >查看总排行榜</el-button
      >
    </div>
    <div class="content">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-table
            :data="playersSort"
            stripe
            style="width: 100%"
          >
            <el-table-column
              prop="seatNum"
              label="座位号"
              width="80"
            >
            </el-table-column>
            <el-table-column
              prop="name"
              label="玩家"
              width="200"
            >
            </el-table-column>
            <el-table-column
              prop="chips"
              label="剩余筹码"
            >
              <template slot-scope="scope">
                <el-input
                  v-model="scope.row.chips"
                  placeholder="请输入该玩家手中剩余筹码"
                  size="mini"
                  clearable
                  @input="limitInput(scope.row)"
                  class="chips"
                ></el-input>
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
              class="humane-model"
            >
            </el-switch>
          </div>
        </el-col>
        <el-col :span="12">
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
                label="胜/负"
                :formatter="formatterResult"
              >
              </el-table-column>
              <el-table-column
                prop="score"
                label="胜率"
                :formatter="formatterWinRate"
              >
              </el-table-column>
              <el-table-column
                prop="score"
                label="状态"
                :formatter="formatterState"
              >
              </el-table-column>
              <el-table-column
                prop="score"
                label="积分"
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
    <el-drawer
      title="我是标题"
      :visible.sync="scoreboardDrawer"
      :with-header="false"
      size="50%"
    >
      <el-card class="box-card">
        <div
          slot="header"
          class="clearfix"
          style="text-align: center; color: blueviolet; font-weight: bold"
        >
          <span>总排行榜</span>
        </div>
        <el-table
          :data="allPlayers"
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
            label="胜/负"
            :formatter="formatterResult"
          >
          </el-table-column>
          <el-table-column
            prop="score"
            label="胜率"
            :formatter="formatterWinRate"
          >
          </el-table-column>
          <el-table-column
            prop="score"
            label="状态"
            :formatter="formatterState"
          >
          </el-table-column>
          <el-table-column
            prop="score"
            label="积分"
          >
          </el-table-column>
        </el-table>
      </el-card>
    </el-drawer>
  </div>
</template>
<script>
import { Player } from '../core/Player';
import { cloneDeep } from 'lodash-es';

export default {
  data() {
    return {
      selectPlayers: [],
      playerOptions: [],
      players: [],
      playersSort: [],
      drawer: false,
      baseChips: 10,
      resultInfo: [],
      humaneModel: false,
      isPlaying: false,
      scoreboardDrawer: false,
      allPlayers: JSON.parse(localStorage.getItem('allPlayers')),
    };
  },
  created() {
    const defaultPlayersName = ['沙河彭于晏', '三哥', '老陈', '闹闹', '洋洋', '小聪明'];
    const playersName = this.allPlayers ? this.allPlayers.map((player) => player.name) : [];
    this.playerOptions = new Set([...defaultPlayersName, ...playersName]);
  },
  methods: {
    createPlayer(seatNum, name) {
      const chips = this.baseChips;
      const raceResult = {
        win: 0,
        lose: 0,
        deuce: 0,
      };
      const raceDate = new Date().getTime();
      const score = 0;
      return new Player(seatNum, name, chips, raceResult, raceDate, score);
    },
    confirmPlayers(players) {
      this.selectPlayers.forEach((name, index) => {
        const isHave = players.findIndex((item) => item.name == name);
        if (isHave === -1) {
          players.push(this.createPlayer(index, name));
        }
      });
    },
    resetSeat() {
      if (this.selectPlayers.length === 0) {
        this.$message.warning('请先选择玩家');
        return;
      }
      this.playersSort = [];
      this.isPlaying = true;
      this.confirmPlayers(this.players);
      // 生成一个随机数组
      const randomArr = this.shuffle(this.selectPlayers.map((item, index) => index + 1));

      this.selectPlayers.forEach((playerName, index) => {
        const player = cloneDeep(this.players).find((p) => p.name == playerName);
        player.seatNum = randomArr[index]; // 重置座位
        player.chips = this.baseChips; // 重置筹码
        this.playersSort.push(player);
      });

      // 按升序排列
      this.playersSort.sort((a, b) => a.seatNum - b.seatNum);
    },
    settleAccount() {
      const inputChips = this.playersSort
        .map((player) => parseFloat(player.chips))
        .reduce((a, b) => (a * 100 + b * 100) / 100);
      const correctChips = this.baseChips * this.playersSort.length;
      if (inputChips === correctChips) {
        this.$confirm('结算前请填写好玩家的剩余筹码, 是否继续结算?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        })
          .then(() => {
            this.outputResult(); // 输出转账结果
            this.updateRanking(this.players); // 更新今日排行榜
            this.updateScoreboard(); // 更新总排行榜
          })
          .catch(() => {});
      } else {
        const diffChips = ((correctChips * 100 - inputChips * 100) / 100).toFixed(2);
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
          player['result'] = 'win';
          winners.push(cloneDeep(player));
        } else if (player.actualChips < 0) {
          player['result'] = 'lose';
          losers.push(cloneDeep(player));
        } else {
          player['result'] = 'deuce';
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
        this.allot(winners, losers);
      }
    },
    handleClose(done) {
      this.$confirm('确认关闭？')
        .then(() => {
          done();
          this.resultInfo = []; // 清空转账消息列表
          this.playersSort = [];
          this.isPlaying = false;
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
    limitInput(value) {
      //限制只能输入两位小数
      const maxChips = this.baseChips * this.playersSort.length;
      if (value.chips > maxChips) {
        value.chips = maxChips;
      }
      if (value.chips < 0) {
        value.chips = 0;
      }
      value.chips =
        ('' + value.chips) // 第一步：转成字符串
          .replace(/[^\d^.]+/g, '') // 第二步：把不是数字，不是小数点的过滤掉
          .replace(/^0+(\d)/, '$1') // 第三步：第一位0开头，0后面为数字，则过滤掉，取后面的数字
          .replace(/^\./, '0.') // 第四步：如果输入的第一位为小数点，则替换成 0. 实现自动补全
          .match(/^\d*(\.?\d{0,2})/g)[0] || ''; // 第五步：最终匹配得到结果 以数字开头，只有一个小数点，而且小数点后面只能有0到2位小数
    },
    updateRanking(players) {
      // 更新今日排行榜
      players.forEach((player) => {
        const currentPlayer = this.playersSort.find((p) => player.name === p.name);
        if (currentPlayer) {
          // 计算今日累计得分
          const playerActualChips = currentPlayer.actualChips;
          player.score = (parseFloat(playerActualChips) * 100 + player.score * 100) / 100;
          // 计算今日胜负结果
          player.raceResult[currentPlayer.result]++;
          // 计算连胜状态，出现deuce状态时为0连胜
          if (currentPlayer.result === 'deuce') {
            player.stateTimes = 0;
          } else if (currentPlayer.result === player.lastState) {
            player.stateTimes++;
          } else {
            player.stateTimes = 1;
          }
          player.lastState = currentPlayer.result; // 记录最后一次的比赛结果
        }
      });
      players.sort((a, b) => b.score - a.score);
    },
    updateScoreboard() {
      // 更新总排行榜
      if (!this.allPlayers) {
        // 本地没有任何数据时
        this.allPlayers = this.players;
        localStorage.setItem('allPlayers', JSON.stringify(this.players));
      } else {
        this.confirmPlayers(this.allPlayers);
        this.updateRanking(this.allPlayers);
        localStorage.setItem('allPlayers', JSON.stringify(this.allPlayers));
      }
    },
    formatterResult(row) {
      return `${row.raceResult.win} / ${row.raceResult.lose}`;
    },
    formatterWinRate(row) {
      const total = row.raceResult.win + row.raceResult.lose + row.raceResult.deuce;
      const rate = total && ((row.raceResult.win / total) * 100).toFixed(1);
      return `${rate}%`;
    },
    formatterState(row) {
      if (row.stateTimes === 0) {
        return `0连胜`;
      } else {
        return `${row.stateTimes}连${row.lastState === 'win' ? '胜' : '败'}`;
      }
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
  position: relative;
}
.humane-model {
  position: absolute;
  top: 10px;
  right: 0;
}
.select-players {
  width: 50%;
  position: relative;
}
.select-players::before {
  content: '*';
  position: absolute;
  top: 12px;
  left: -18px;
  color: red;
  font-size: 20px;
}
.chips {
  width: 200px;
}
</style>
