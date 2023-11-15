<template>
  <div class="start">
    <div class="content-wrap">
      <div class="content">
        <div class="players">
          <el-select
            v-model="selectPlayers"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="请选择玩家"
          >
            <el-option
              v-for="item in options"
              :key="item.key"
              :label="item.name"
              :value="item.name"
            >
            </el-option>
          </el-select>
        </div>
        <div class="start-button">
          <el-button
            type="warning"
            plain
            icon="el-icon-guide"
            @click="start"
            >开始游戏</el-button
          >
        </div>
      </div>
    </div>
  </div>
</template>
<script>
export default {
  data() {
    return {
      options: null,
      selectPlayers: [],
      chip: 10,
    };
  },
  created() {
    // 初始化默认玩家列表
    const playerName = ['沙河彭于晏', '三哥', '老陈', '闹闹', '洋洋', '小聪明', '刘小甜'];
    const players = [];
    playerName.forEach((name, index) => {
      players.push({
        key: index,
        name: name,
      });
    });
    this.options = players;
    console.log(players);
  },
  methods: {
    start() {
      this.$emit('start', this.selectPlayers);
    },
  },
};
</script>
<style scoped>
.start {
  display: fixed;
  width: 100vw;
  height: 100vh;
  background-color: antiquewhite;
}
.content-wrap {
  width: 50%;
  height: 50%;
  border: 1px solid black;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: url('../assets/startImg.jpg') no-repeat center;
  background-size: cover;
  border-radius: 20px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}
.start-button {
  text-align: center;
  margin-top: 20px;
}
.start-button .el-button {
  width: 200px;
  font-size: 20px;
  padding: 20px 0;
}
.content {
  width: 60%;
}
.content .el-select {
  width: 100%;
}
.players {
  display: flex;
}
</style>
