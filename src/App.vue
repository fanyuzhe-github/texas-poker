<template>
  <div id="app">
    <GameStart
      v-if="!isStarted"
      @start="startGame"
    />
    <GameDetail
      v-if="isStarted"
      :playersName="playersName"
    />
  </div>
</template>

<script>
import GameStart from './components/GameStart.vue';
import GameDetail from './components/GameDetail.vue';

export default {
  name: 'App',
  components: {
    GameStart,
    GameDetail,
  },
  data() {
    return {
      isStarted: false,
      playersName: [],
    };
  },
  methods: {
    startGame(players) {
      this.isStarted = true;
      this.playersName = players;
    },
  },
};
</script>

<style></style>
