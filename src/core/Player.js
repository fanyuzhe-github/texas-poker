export class Player {
  constructor(seatNum, name, chips, raceResult, raceDate, score) {
    this.seatNum = seatNum; // 座位号
    this.name = name; // 姓名
    this.chips = chips; // 剩余筹码
    this.raceResult = raceResult; // 比赛结果： win,lose,deuce
    this.raceDate = raceDate; // 比赛日期
    this.score = score; // 累计分数
    this.lastState = 'deuce'; // 上次比赛结果
    this.stateTimes = 0; // 维持同一个比赛结果的次数
  }
}
