import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function getLocalDateString(date: Date, offsetMinutes: number): string {
  const localTime = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return localTime.toISOString().split('T')[0];
}

function isConsecutiveDay(day1: string, day2: string): boolean {
  const d1 = new Date(day1);
  const d2 = new Date(day2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function getUtcStartOfDay(localDateStr: string, offsetMinutes: number): Date {
  const d = new Date(`${localDateStr}T00:00:00.000Z`);
  return new Date(d.getTime() - offsetMinutes * 60 * 1000);
}

function getUtcEndOfDay(localDateStr: string, offsetMinutes: number): Date {
  const d = new Date(`${localDateStr}T23:59:59.999Z`);
  return new Date(d.getTime() - offsetMinutes * 60 * 1000);
}

function createSeedRandom(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: number, tzOffset: number) {
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    if (stats.lastStudyDate) {
      const localLastStudyStr = getLocalDateString(
        stats.lastStudyDate,
        tzOffset,
      );
      const localTodayStr = getLocalDateString(new Date(), tzOffset);

      if (
        localTodayStr !== localLastStudyStr &&
        !isConsecutiveDay(localLastStudyStr, localTodayStr)
      ) {
        if (stats.currentStreak > 0) {
          // Reset streak immediately since Streak Freeze is removed
          stats = await this.prisma.userStats.update({
            where: { userId },
            data: { currentStreak: 0 },
          });
        }
      }
    }

    // 1. Completed cards today
    const localTodayStr = getLocalDateString(new Date(), tzOffset);
    const startOfToday = getUtcStartOfDay(localTodayStr, tzOffset);
    const endOfToday = getUtcEndOfDay(localTodayStr, tzOffset);

    const completedCards = await this.prisma.studyLog.count({
      where: {
        userId,
        createdAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    });

    // 2. Total unique cards studied
    const distinctCards = await this.prisma.studyLog.groupBy({
      by: ['cardId'],
      where: { userId },
    });
    const totalStudied = distinctCards.length;

    return {
      streak: stats.currentStreak,
      completedCards,
      totalStudied,
      xp: stats.xp,
      coins: stats.coins,
      dailyTarget: stats.dailyTarget,
      streakFreezeCount: stats.streakFreezeCount,
      xpBoostCount: stats.xpBoostCount,
      xpBoostUntil: stats.xpBoostUntil,
      water: stats.water,
      fertilizer: stats.fertilizer,
      harvestPoints: stats.harvestPoints,
    };
  }

  async getHeatmap(userId: number, tzOffset: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 98); // Query past 14 weeks

    const logs = await this.prisma.studyLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: cutoffDate,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Count reviews by local date
    const countsMap = new Map<string, number>();
    for (const log of logs) {
      const day = getLocalDateString(log.createdAt, tzOffset);
      countsMap.set(day, (countsMap.get(day) || 0) + 1);
    }

    // Fill all 98 days in chronological order
    const result: any[] = [];
    const now = new Date();
    for (let i = 97; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dayStr = getLocalDateString(d, tzOffset);
      result.push({
        date: dayStr,
        count: countsMap.get(dayStr) || 0,
      });
    }

    return result;
  }

  async getBadges(userId: number) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    const streak = stats ? stats.currentStreak : 0;

    const distinctCards = await this.prisma.studyLog.groupBy({
      by: ['cardId'],
      where: { userId },
    });
    const totalStudied = distinctCards.length;

    const allBadges = [
      {
        id: 'first_step',
        name: 'Bước Đi Đầu Tiên',
        description: 'Học thành công 1 thẻ từ vựng.',
        unlocked: totalStudied >= 1,
        icon: 'Flame',
      },
      {
        id: 'dedicated_learner',
        name: 'Học Giả Chăm Chỉ',
        description: 'Đạt chuỗi học tập 3 ngày liên tiếp.',
        unlocked: streak >= 3,
        icon: 'Calendar',
      },
      {
        id: 'super_streak',
        name: 'Chuỗi Kỷ Lục',
        description: 'Đạt chuỗi học tập 7 ngày liên tiếp.',
        unlocked: streak >= 7,
        icon: 'Award',
      },
      {
        id: 'flashcard_master',
        name: 'Bậc Thầy Từ Vựng',
        description: 'Ôn tập thành công 50 thẻ từ vựng khác nhau.',
        unlocked: totalStudied >= 50,
        icon: 'Trophy',
      },
    ];

    return allBadges.filter((b) => b.unlocked);
  }

  async updateGoals(userId: number, dailyTarget: number) {
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: {
          userId,
          dailyTarget,
        },
      });
    } else {
      stats = await this.prisma.userStats.update({
        where: { userId },
        data: {
          dailyTarget,
        },
      });
    }

    return {
      dailyTarget: stats.dailyTarget,
    };
  }

  async updateXPAndCoins(userId: number, xpToAdd: number, coinsToAdd: number) {
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    let finalXpToAdd = xpToAdd;
    if (stats.xpBoostUntil && stats.xpBoostUntil > new Date()) {
      finalXpToAdd = xpToAdd * 2;
    }

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        xp: { increment: finalXpToAdd },
        coins: { increment: coinsToAdd },
      },
    });
    return {
      xp: updated.xp,
      coins: updated.coins,
    };
  }

  async buyItem(userId: number, itemPrice: number, itemType: string) {
    if (itemType === 'freeze') {
      throw new Error('Vật phẩm Bảo Mệnh Đan không còn khả dụng.');
    }

    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats || stats.coins < itemPrice) {
      throw new Error('Số xu tích lũy không đủ để mua vật phẩm này.');
    }

    const dataToUpdate: any = {
      coins: { decrement: itemPrice },
    };

    if (itemType === 'booster') {
      dataToUpdate.xpBoostCount = { increment: 1 };
    } else if (itemType === 'water') {
      dataToUpdate.water = { increment: 10 };
    } else if (itemType === 'fertilizer') {
      dataToUpdate.fertilizer = { increment: 5 };
    } else {
      throw new Error('Loại vật phẩm không hợp lệ.');
    }

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: dataToUpdate,
    });

    return {
      coins: updated.coins,
      streakFreezeCount: updated.streakFreezeCount,
      xpBoostCount: updated.xpBoostCount,
      water: updated.water,
      fertilizer: updated.fertilizer,
      harvestPoints: updated.harvestPoints,
    };
  }

  async useXpBoost(userId: number) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new Error('User stats not found');
    }
    if (stats.xpBoostCount <= 0) {
      throw new Error('Bạn không có bình thuốc nhân đôi XP nào để sử dụng.');
    }

    const xpBoostUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        xpBoostCount: { decrement: 1 },
        xpBoostUntil,
      },
    });

    return {
      xpBoostCount: updated.xpBoostCount,
      xpBoostUntil: updated.xpBoostUntil,
    };
  }

  async getDailyQuests(_userId: number, _tzOffset: number) {
    // Return empty array since daily quests are removed
    return [];
  }

  async incrementQuestProgress(
    _userId: number,
    _questType: string,
    _amount: number,
    _tzOffset: number,
  ) {
    // Return success object as no-op to prevent breaking existing calls
    return { success: true };
  }

  async getGardenState(userId: number, tzOffset: number, all = false) {
    // 1. Get all progresses for the user
    const progresses = await this.prisma.userProgress.findMany({
      where: { userId },
      include: { flashcard: true },
    });

    const now = new Date();
    let seedsCount = 0;
    let sproutsCount = 0;
    let saplingsCount = 0;
    let goldenTreesCount = 0;
    let overdueCount = 0;

    const seeds: any[] = [];
    const sprouts: any[] = [];
    const saplings: any[] = [];
    const goldens: any[] = [];

    for (const p of progresses) {
      const isOverdue = p.nextReviewDate <= now;
      if (isOverdue) overdueCount++;

      if (p.repetitions === 0) {
        seedsCount++;
        seeds.push(p);
      } else if (p.interval < 7) {
        sproutsCount++;
        sprouts.push(p);
      } else if (p.interval < 30) {
        saplingsCount++;
        saplings.push(p);
      } else {
        goldenTreesCount++;
        goldens.push(p);
      }
    }

    // Helper to shuffle array in-place
    const shuffle = (arr: any[]) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const mapProgressToPlant = (
      p: any,
      stage: 'seed' | 'sprout' | 'sapling' | 'golden',
    ) => ({
      id: p.id,
      hanzi: p.flashcard.hanzi,
      pinyin: p.flashcard.pinyin || '',
      meaning: p.flashcard.meaning || '',
      stage,
      interval: p.interval,
      nextReviewDate: p.nextReviewDate,
      isOverdue: p.nextReviewDate <= now,
    });

    const displayPlants: any[] = [];
    if (all) {
      // Map all progresses
      for (const p of progresses) {
        let stage: 'seed' | 'sprout' | 'sapling' | 'golden';
        if (p.repetitions === 0) stage = 'seed';
        else if (p.interval < 7) stage = 'sprout';
        else if (p.interval < 30) stage = 'sapling';
        else stage = 'golden';
        displayPlants.push(mapProgressToPlant(p, stage));
      }
    } else {
      // Pick up to 3 cards from each category to display (max 12 plants)
      const selectedSeeds = shuffle(seeds).slice(0, 3);
      const selectedSprouts = shuffle(sprouts).slice(0, 3);
      const selectedSaplings = shuffle(saplings).slice(0, 3);
      const selectedGoldens = shuffle(goldens).slice(0, 3);

      displayPlants.push(
        ...selectedSeeds.map((p) => mapProgressToPlant(p, 'seed')),
      );
      displayPlants.push(
        ...selectedSprouts.map((p) => mapProgressToPlant(p, 'sprout')),
      );
      displayPlants.push(
        ...selectedSaplings.map((p) => mapProgressToPlant(p, 'sapling')),
      );
      displayPlants.push(
        ...selectedGoldens.map((p) => mapProgressToPlant(p, 'golden')),
      );
    }

    // Get user stats to check harvest date
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    let canHarvest = false;
    const harvestReward =
      goldenTreesCount > 0
        ? Math.min(20, Math.max(2, goldenTreesCount * 2))
        : 0;

    if (goldenTreesCount > 0) {
      if (!stats.lastGardenHarvestDate) {
        canHarvest = true;
      } else {
        const localTodayStr = getLocalDateString(new Date(), tzOffset);
        const localLastHarvestStr = getLocalDateString(
          stats.lastGardenHarvestDate,
          tzOffset,
        );
        canHarvest = localTodayStr !== localLastHarvestStr;
      }
    }

    return {
      seedsCount,
      sproutsCount,
      saplingsCount,
      goldenTreesCount,
      overdueCount,
      plants: displayPlants,
      canHarvest,
      harvestReward,
      lastHarvestDate: stats.lastGardenHarvestDate,
      water: stats.water,
      fertilizer: stats.fertilizer,
      harvestPoints: stats.harvestPoints,
    };
  }

  async harvestGarden(userId: number, tzOffset: number) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new Error('User stats not found');
    }

    // Count actual golden trees
    const goldenTreesCount = await this.prisma.userProgress.count({
      where: {
        userId,
        repetitions: { gt: 0 },
        interval: { gte: 30 },
      },
    });

    if (goldenTreesCount === 0) {
      throw new Error(
        'Bạn cần có ít nhất một Cây cổ thụ hoàng kim (ôn tập giãn cách >= 30 ngày) để thu hoạch!',
      );
    }

    // Check harvest limit
    if (stats.lastGardenHarvestDate) {
      const localTodayStr = getLocalDateString(new Date(), tzOffset);
      const localLastHarvestStr = getLocalDateString(
        stats.lastGardenHarvestDate,
        tzOffset,
      );
      if (localTodayStr === localLastHarvestStr) {
        throw new Error(
          'Hôm nay bạn đã thu hoạch rồi, hãy quay lại vào ngày mai nhé!',
        );
      }
    }

    const reward = Math.min(20, Math.max(2, goldenTreesCount * 2));

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        coins: { increment: reward },
        lastGardenHarvestDate: new Date(),
      },
    });

    return {
      harvestedCoins: reward,
      newBalance: updated.coins,
    };
  }

  async getDailyQuiz(userId: number, tzOffset: number) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);

    // Fetch HSK 1-3 candidate words from dictionary
    const candidates = await this.prisma.dictionaryWord.findMany({
      where: {
        hsk: { in: [1, 2, 3] },
      },
      select: {
        id: true,
        s: true,
        p: true,
        vi: true,
        hsk: true,
      },
    });

    // Fallback static question if database table is empty
    if (candidates.length === 0) {
      return {
        question: 'Chữ Hán nào dưới đây mang ý nghĩa là "Khó" (Nán/Difficult)?',
        options: [
          { text: 'A. 难 (nán)', isCorrect: true },
          { text: 'B. 易 (yì)', isCorrect: false },
          { text: 'C. 忙 (máng)', isCorrect: false },
          { text: 'D. 慢 (màn)', isCorrect: false },
        ],
        xpReward: 20,
        coinReward: 10,
      };
    }

    const rng = createSeedRandom(userId.toString() + '_' + localTodayStr);

    const correctIdx = Math.floor(rng() * candidates.length);
    const correctWord = candidates[correctIdx];

    const incorrectWords: any[] = [];
    let attempts = 0;
    while (incorrectWords.length < 3 && attempts < 100) {
      attempts++;
      const idx = Math.floor(rng() * candidates.length);
      const w = candidates[idx];
      if (
        w.id !== correctWord.id &&
        !incorrectWords.some((x) => x.id === w.id) &&
        w.s !== correctWord.s &&
        w.vi !== correctWord.vi
      ) {
        incorrectWords.push(w);
      }
    }

    // Fallback if not enough candidates found
    while (incorrectWords.length < 3) {
      const idx = Math.floor(rng() * candidates.length);
      const w = candidates[idx];
      if (w.id !== correctWord.id) {
        incorrectWords.push(w);
      }
    }

    const questionType = rng() < 0.5 ? 'hanzi_to_meaning' : 'meaning_to_hanzi';
    let questionText = '';
    let options: { text: string; isCorrect: boolean }[] = [];

    if (questionType === 'hanzi_to_meaning') {
      questionText = `Chữ Hán "${correctWord.s}" (${correctWord.p || ''}) mang ý nghĩa nào dưới đây?`;
      options = [
        { text: correctWord.vi || 'Không rõ nghĩa', isCorrect: true },
        { text: incorrectWords[0].vi || 'Không rõ nghĩa', isCorrect: false },
        { text: incorrectWords[1].vi || 'Không rõ nghĩa', isCorrect: false },
        { text: incorrectWords[2].vi || 'Không rõ nghĩa', isCorrect: false },
      ];
    } else {
      questionText = `Từ nào dưới đây mang ý nghĩa là "${correctWord.vi || 'Không rõ nghĩa'}"?`;
      options = [
        { text: `${correctWord.s} (${correctWord.p || ''})`, isCorrect: true },
        {
          text: `${incorrectWords[0].s} (${incorrectWords[0].p || ''})`,
          isCorrect: false,
        },
        {
          text: `${incorrectWords[1].s} (${incorrectWords[1].p || ''})`,
          isCorrect: false,
        },
        {
          text: `${incorrectWords[2].s} (${incorrectWords[2].p || ''})`,
          isCorrect: false,
        },
      ];
    }

    // Shuffle options deterministically
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    // Map prefix labels (A, B, C, D)
    const prefixes = ['A. ', 'B. ', 'C. ', 'D. '];
    const finalOptions = options.map((opt, idx) => ({
      text: prefixes[idx] + opt.text,
      isCorrect: opt.isCorrect,
    }));

    return {
      question: questionText,
      options: finalOptions,
      xpReward: 20,
      coinReward: 10,
    };
  }
}
