// Định nghĩa các hằng số đánh giá (Rating) và trạng thái (State)
export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface Card {
  due: Date;
  stability: number; // S: Khả năng duy trì trí nhớ (tính bằng ngày)
  difficulty: number; // D: Độ khó của thẻ (1 -> 10)
  elapsedDays: number; // t: Số ngày kể từ lần học gần nhất
  reps: number;
  lapses: number;
  state: State;
  lastReview?: Date;
}

export interface SchedulingInfo {
  card: Card;
  interval: number; // Số ngày đến lần ôn tập tiếp theo
}

export class FSRS {
  // 17 tham số chuẩn của mô hình FSRS-4.5
  private w: number[] = [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
    0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466,
  ];

  private requestRetention: number; // Xác suất muốn nhớ lại (mặc định 90%)
  private decay: number = -0.5;
  private factor: number;

  constructor(requestRetention: number = 0.9) {
    this.requestRetention = requestRetention;
    this.factor = Math.pow(0.9, 1 / this.decay) - 1;
  }

  // 1. Tính khả năng nhớ lại (Retrievability: R)
  public forgettingCurve(elapsedDays: number, stability: number): number {
    if (stability === 0) return 0;
    return Math.pow(1 + this.factor * (elapsedDays / stability), this.decay);
  }

  // Khởi tạo trạng thái cho thẻ mới (State.New)
  private initCard(rating: Rating): { stability: number; difficulty: number } {
    const s = this.w[rating - 1];
    let d = this.w[4] - Math.exp(this.w[5] * (rating - 1)) + 1;
    d = Math.min(Math.max(d, 1), 10); // Giới hạn D trong khoảng [1, 10]
    return { stability: s, difficulty: d };
  }

  // Cập nhật độ khó (Difficulty) sau mỗi lần review
  private nextDifficulty(d: number, rating: Rating): number {
    const deltaD = -this.w[6] * (rating - 3);
    const nextD = d + deltaD * ((10 - d) / 9);
    // Áp dụng hiện tượng Mean Reversion về độ khó trung bình w[4]
    const meanReversionD = this.w[7] * this.w[4] + (1 - this.w[7]) * nextD;
    return Math.min(Math.max(meanReversionD, 1), 10);
  }

  // Tính Stability mới khi nhớ thành công (Good, Hard, Easy)
  private nextRecallStability(
    d: number,
    s: number,
    r: number,
    rating: Rating,
  ): number {
    const hardPenalty = rating === Rating.Hard ? this.w[15] : 1;
    const easyBonus = rating === Rating.Easy ? this.w[16] : 1;
    const modifier =
      1 +
      Math.exp(this.w[8]) *
        (11 - d) *
        Math.pow(s, -this.w[9]) *
        (Math.exp((1 - r) * this.w[10]) - 1) *
        hardPenalty *
        easyBonus;
    return s * modifier;
  }

  // Tính Stability mới khi quên (Again)
  private nextForgetStability(d: number, s: number, r: number): number {
    return (
      this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp((1 - r) * this.w[14])
    );
  }

  // Tính khoảng cách ngày ôn tập tiếp theo (Interval)
  private calculateInterval(stability: number): number {
    const newInterval =
      (stability / this.factor) *
      (Math.pow(this.requestRetention, 1 / this.decay) - 1);
    return Math.max(1, Math.round(newInterval));
  }

  // Hàm xử lý chính khi người dùng hoàn thành một lần ôn tập
  public schedule(
    card: Card,
    rating: Rating,
    now: Date = new Date(),
  ): Record<Rating, SchedulingInfo> {
    const result: Partial<Record<Rating, SchedulingInfo>> = {};

    const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

    for (const r of ratings) {
      let newStability: number;
      let newDifficulty: number;
      let newState: State;
      let lapses = card.lapses;
      const reps = card.reps + 1;

      if (card.state === State.New) {
        const init = this.initCard(r);
        newStability = init.stability;
        newDifficulty = init.difficulty;
        newState = r === Rating.Again ? State.Learning : State.Review;
      } else {
        const retrievability = this.forgettingCurve(
          card.elapsedDays,
          card.stability,
        );
        newDifficulty = this.nextDifficulty(card.difficulty, r);

        if (r === Rating.Again) {
          newStability = this.nextForgetStability(
            card.difficulty,
            card.stability,
            retrievability,
          );
          newState = State.Relearning;
          lapses += 1;
        } else {
          newStability = this.nextRecallStability(
            card.difficulty,
            card.stability,
            retrievability,
            r,
          );
          newState = State.Review;
        }
      }

      const interval =
        newState === State.Review ? this.calculateInterval(newStability) : 1;
      const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

      const nextCard: Card = {
        ...card,
        stability: newStability,
        difficulty: newDifficulty,
        state: newState,
        reps: reps,
        lapses: lapses,
        elapsedDays: 0,
        lastReview: now,
        due: due,
      };

      result[r] = { card: nextCard, interval };
    }

    return result as Record<Rating, SchedulingInfo>;
  }
}
