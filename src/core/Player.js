export class Player {
  constructor(seatNum, name, chips, raceResult, raceDate, winnerTimes, score, isPlaying) {
    this.seatNum = seatNum; // 座位号
    this.name = name; // 姓名
    this.chips = chips; // 剩余筹码
    this.raceResult = raceResult; // 比赛结果： win,lose,deuce
    this.raceDate = raceDate; // 比赛日期
    this.winnerTimes = winnerTimes; // 赢得比赛次数
    this.score = score; // 累计分数
    this.isPlaying = isPlaying; // 是否正在游戏中
  }
}
