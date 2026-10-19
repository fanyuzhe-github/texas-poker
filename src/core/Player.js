export class Player {
  constructor(
    seatNum,
    name,
    chips,
    raceResult,
    raceDate,
    score,
    parent = null,
    isMain = false,
    avatar = ""
  ) {
    this.seatNum = seatNum; // 座位号
    this.name = name; // 姓名
    this.parent = parent; // 所属主账号名，null 表示自己就是主账号
    // 顶层账号里，「主账号」可以下场，也可以在名下挂子账号做汇总；
    // 没被标记成主账号的顶层账号是「独立号」，同样自己就能上桌
    this.isMain = isMain === true;
    this.chips = chips; // 剩余筹码
    this.raceResult = raceResult; // 比赛结果： win,lose,deuce
    this.raceDate = raceDate; // 比赛日期
    this.score = score; // 累计分数
    this.lastState = "deuce"; // 上次比赛结果
    this.stateTimes = 0; // 维持同一个比赛结果的次数
    // 头像："" 表示没挑过，展示时按昵称自动生成色块头像
    this.avatar = typeof avatar === "string" ? avatar : "";
  }
}

/**
 * 创建一个战绩清零的新玩家。
 * @param {number} seatNum 座位号
 * @param {string} name 昵称
 * @param {number} buyIn 本局投入
 * @param {string|null} parent 所属主账号名，为空表示顶层账号
 * @param {boolean} isMain 是否为主账号（可上桌，也可挂子账号做汇总）
 * @param {string} [avatar] 头像（内置 id 或图片 data URI，空串表示用默认）
 */
export function createPlayer(
  seatNum,
  name,
  buyIn,
  parent = null,
  isMain = false,
  avatar = ""
) {
  return new Player(
    seatNum,
    name,
    buyIn,
    { win: 0, lose: 0, deuce: 0 },
    Date.now(),
    0,
    parent || null,
    isMain === true,
    avatar
  );
}
