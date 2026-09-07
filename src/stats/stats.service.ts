import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function getLocalDateString(
  date: Date | string | number,
  offsetMinutes: number,
): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const localTime = new Date(d.getTime() + (offsetMinutes || 0) * 60 * 1000);
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
    // Sanity guard: Clamp allowable rewards per request to prevent client-side inflation or abuse
    const safeXp = Math.min(30, Math.max(0, Math.floor(xpToAdd || 0)));
    const safeCoins = Math.min(10, Math.max(0, Math.floor(coinsToAdd || 0)));

    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    let finalXpToAdd = safeXp;
    if (stats.xpBoostUntil && stats.xpBoostUntil > new Date()) {
      finalXpToAdd = safeXp * 2;
    }

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        xp: { increment: finalXpToAdd },
        coins: { increment: safeCoins },
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

  async getDailyQuests(userId: number, tzOffset: number) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);

    // 1. Fetch user's quests for today
    let quests = await this.prisma.userQuest.findMany({
      where: {
        userId,
        dateStr: localTodayStr,
      },
      orderBy: { id: 'asc' },
    });

    // 2. If no quests exist for today, initialize default 4 quests
    if (quests.length === 0) {
      const defaultQuestsData = [
        {
          userId,
          dateStr: localTodayStr,
          questType: 'STUDY_CARDS',
          title: 'Ôn tập 20 thẻ bài',
          description: 'Hoàn thành lượt ôn thẻ định kỳ hôm nay',
          target: 20,
          progress: 0,
          xpReward: 30,
          coinReward: 10,
          completed: false,
        },
        {
          userId,
          dateStr: localTodayStr,
          questType: 'DICTIONARY_LOOKUP',
          title: 'Tra cứu 3 từ vựng mới',
          description: 'Tìm hiểu từ mới và xem chiết tự chữ Hán',
          target: 3,
          progress: 0,
          xpReward: 15,
          coinReward: 5,
          completed: false,
        },
        {
          userId,
          dateStr: localTodayStr,
          questType: 'WRITE_PRACTICE',
          title: 'Luyện viết 5 chữ Hán',
          description: 'Tập viết đúng quy tắc bút thuận trên canvas',
          target: 5,
          progress: 0,
          xpReward: 25,
          coinReward: 10,
          completed: false,
        },
        {
          userId,
          dateStr: localTodayStr,
          questType: 'PLAY_GAME',
          title: 'Thử thách 1 ván Đấu trường',
          description: 'Rèn luyện phản xạ với Falling Words hoặc Quiz',
          target: 1,
          progress: 0,
          xpReward: 20,
          coinReward: 5,
          completed: false,
        },
      ];

      await this.prisma.userQuest.createMany({
        data: defaultQuestsData,
      });

      quests = await this.prisma.userQuest.findMany({
        where: {
          userId,
          dateStr: localTodayStr,
        },
        orderBy: { id: 'asc' },
      });
    }

    // 3. Sync live progress from real study log table for STUDY_CARDS
    const startOfToday = getUtcStartOfDay(localTodayStr, tzOffset);
    const endOfToday = getUtcEndOfDay(localTodayStr, tzOffset);

    const studyCount = await this.prisma.studyLog.count({
      where: {
        userId,
        createdAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    });

    return quests.map((q) => {
      let liveProgress = q.progress;
      if (q.questType === 'STUDY_CARDS') {
        liveProgress = studyCount;
      }
      return {
        id: q.id,
        questType: q.questType,
        title: q.title,
        description: q.description,
        target: q.target,
        progress: liveProgress,
        xpReward: q.xpReward,
        coinReward: q.coinReward,
        completed: q.completed,
      };
    });
  }

  async claimQuestReward(userId: number, questId: number) {
    const quest = await this.prisma.userQuest.findFirst({
      where: {
        id: questId,
        userId,
      },
    });

    if (!quest) {
      throw new BadRequestException('Nhiệm vụ không tồn tại');
    }

    if (quest.completed) {
      throw new BadRequestException(
        'Nhiệm vụ này đã được nhận thưởng hôm nay rồi',
      );
    }

    // Mark as completed (claimed) and give rewards atomically
    const [updatedQuest, updatedStats] = await this.prisma.$transaction([
      this.prisma.userQuest.update({
        where: { id: quest.id },
        data: { completed: true },
      }),
      this.prisma.userStats.upsert({
        where: { userId },
        update: {
          xp: { increment: quest.xpReward },
          coins: { increment: quest.coinReward },
        },
        create: {
          userId,
          xp: quest.xpReward,
          coins: quest.coinReward,
        },
      }),
    ]);

    return {
      success: true,
      quest: updatedQuest,
      xp: updatedStats.xp,
      coins: updatedStats.coins,
    };
  }

  async incrementQuestProgress(
    userId: number,
    questType: string,
    amount: number,
    tzOffset: number,
  ) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);
    const quest = await this.prisma.userQuest.findFirst({
      where: {
        userId,
        questType,
        dateStr: localTodayStr,
      },
    });

    if (quest && !quest.completed) {
      await this.prisma.userQuest.update({
        where: { id: quest.id },
        data: {
          progress: { increment: amount },
        },
      });
    }

    return { success: true };
  }

  async getGardenState(userId: number, tzOffset: number, _all = true) {
    // 1. Get all progresses for the user with deck info
    const progresses = await this.prisma.userProgress.findMany({
      where: { userId },
      include: {
        flashcard: {
          include: {
            deck: {
              select: { id: true, title: true, description: true },
            },
          },
        },
      },
      orderBy: { nextReviewDate: 'asc' },
    });

    const now = new Date();
    let seedsCount = 0;
    let sproutsCount = 0;
    let saplingsCount = 0;
    let goldenTreesCount = 0;
    let overdueCount = 0;

    const displayPlants: any[] = [];
    const deckMap = new Map<number, any>();

    for (const p of progresses) {
      const isOverdue = p.nextReviewDate <= now;
      if (isOverdue) overdueCount++;

      let stage: 'seed' | 'sprout' | 'sapling' | 'golden';
      if (p.repetitions === 0) {
        stage = 'seed';
        seedsCount++;
      } else if (p.interval < 7) {
        stage = 'sprout';
        sproutsCount++;
      } else if (p.interval < 30) {
        stage = 'sapling';
        saplingsCount++;
      } else {
        stage = 'golden';
        goldenTreesCount++;
      }

      const growthPercentage =
        stage === 'golden'
          ? 100
          : stage === 'sapling'
            ? Math.min(95, Math.round(50 + ((p.interval - 7) / 23) * 45))
            : stage === 'sprout'
              ? Math.min(49, Math.round(15 + (p.interval / 7) * 34))
              : 5;

      const deckId = p.flashcard.deckId;
      const deckTitle = p.flashcard.deck?.title || 'Bộ thẻ mặc định';

      // Aggregate deck plot metrics
      if (!deckMap.has(deckId)) {
        deckMap.set(deckId, {
          id: deckId,
          title: deckTitle,
          description: p.flashcard.deck?.description || '',
          totalPlants: 0,
          overdueCount: 0,
          goldenCount: 0,
          saplingCount: 0,
          sproutCount: 0,
          seedCount: 0,
        });
      }
      const deckSummary = deckMap.get(deckId);
      deckSummary.totalPlants++;
      if (isOverdue) deckSummary.overdueCount++;
      if (stage === 'golden') deckSummary.goldenCount++;
      else if (stage === 'sapling') deckSummary.saplingCount++;
      else if (stage === 'sprout') deckSummary.sproutCount++;
      else deckSummary.seedCount++;

      displayPlants.push({
        id: p.id,
        cardId: p.flashcard.id,
        deckId,
        deckTitle,
        hanzi: p.flashcard.hanzi,
        pinyin: p.flashcard.pinyin || '',
        meaning: p.flashcard.meaning || '',
        exampleHanzi: p.flashcard.exampleHanzi || '',
        examplePinyin: p.flashcard.examplePinyin || '',
        exampleMeaning: p.flashcard.exampleMeaning || '',
        audioUrl: p.flashcard.audioUrl || '',
        stage,
        interval: p.interval,
        repetitions: p.repetitions,
        nextReviewDate: p.nextReviewDate,
        isOverdue,
        growthPercentage,
      });
    }

    // Calculate health rates for decks and convert to array
    const decks = Array.from(deckMap.values())
      .map((d) => ({
        ...d,
        healthRate:
          d.totalPlants > 0
            ? Math.round(
                ((d.totalPlants - d.overdueCount) / d.totalPlants) * 100,
              )
            : 100,
      }))
      .sort((a, b) => b.totalPlants - a.totalPlants);

    // Sort: Overdue plants first, then by growth percentage desc
    displayPlants.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return b.growthPercentage - a.growthPercentage;
    });

    // Get user stats to check harvest date and resources
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    const totalProductive = goldenTreesCount + saplingsCount + sproutsCount;
    let canHarvest = false;
    const harvestReward =
      totalProductive > 0
        ? Math.min(
            35,
            Math.max(
              5,
              goldenTreesCount * 5 + saplingsCount * 2 + sproutsCount * 1,
            ),
          )
        : 0;

    if (totalProductive > 0) {
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
      totalPlants: progresses.length,
      plants: displayPlants,
      decks,
      canHarvest,
      harvestReward,
      lastHarvestDate: stats.lastGardenHarvestDate,
      water: stats.water ?? 0,
      fertilizer: stats.fertilizer ?? 0,
      coins: stats.coins ?? 0,
      xp: stats.xp ?? 0,
    };
  }

  async waterGarden(
    userId: number,
    body: {
      plantId?: number;
      waterAll?: boolean;
      deckId?: number;
      tzOffset?: number;
    },
  ) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new BadRequestException('Không tìm thấy thông tin người dùng.');
    }

    if (stats.water <= 0) {
      throw new BadRequestException(
        'Bạn đã hết nước tưới! Hãy học thêm flashcard để nhận thêm nước nhé. 💧',
      );
    }

    const now = new Date();

    // Water entire deck plot
    if (body.deckId) {
      const overduePlants = await this.prisma.userProgress.findMany({
        where: {
          userId,
          nextReviewDate: { lte: now },
          flashcard: { deckId: body.deckId },
        },
      });

      if (overduePlants.length === 0) {
        return {
          success: true,
          message: 'Tất cả cây trong mảnh vườn này đều đang xanh tươi!',
          wateredCount: 0,
          remainingWater: stats.water,
        };
      }

      const waterNeeded = Math.min(stats.water, overduePlants.length);
      const targetIds = overduePlants.slice(0, waterNeeded).map((p) => p.id);

      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await this.prisma.userProgress.updateMany({
        where: { id: { in: targetIds } },
        data: { nextReviewDate: tomorrow },
      });

      const xpEarned = waterNeeded * 5;
      const updated = await this.prisma.userStats.update({
        where: { userId },
        data: {
          water: { decrement: waterNeeded },
          xp: { increment: xpEarned },
        },
      });

      return {
        success: true,
        message: `Đã tưới thành công ${waterNeeded} cây trong mảnh vườn! Nhận được +${xpEarned} XP! 🌱`,
        wateredCount: waterNeeded,
        xpEarned,
        remainingWater: updated.water,
      };
    }

    if (body.waterAll) {
      // Find all overdue plants
      const overduePlants = await this.prisma.userProgress.findMany({
        where: {
          userId,
          nextReviewDate: { lte: now },
        },
      });

      if (overduePlants.length === 0) {
        return {
          success: true,
          message:
            'Tất cả cây trong vườn đều đang xanh tươi, chưa cần tưới thêm!',
          wateredCount: 0,
          remainingWater: stats.water,
        };
      }

      const waterNeeded = Math.min(stats.water, overduePlants.length);
      const targetIds = overduePlants.slice(0, waterNeeded).map((p) => p.id);

      // Hydrate targets: postpone nextReviewDate by 1 day as hydration bonus
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await this.prisma.userProgress.updateMany({
        where: { id: { in: targetIds } },
        data: { nextReviewDate: tomorrow },
      });

      const xpEarned = waterNeeded * 5;
      const updated = await this.prisma.userStats.update({
        where: { userId },
        data: {
          water: { decrement: waterNeeded },
          xp: { increment: xpEarned },
        },
      });

      return {
        success: true,
        message: `Đã tưới thành công ${waterNeeded} cây! Nhận được +${xpEarned} XP! 🌱`,
        wateredCount: waterNeeded,
        xpEarned,
        remainingWater: updated.water,
      };
    }

    // Single plant water
    if (body.plantId) {
      const plant = await this.prisma.userProgress.findFirst({
        where: { id: body.plantId, userId },
      });
      if (!plant) throw new Error('Không tìm thấy cây này trong vườn.');

      // Hydrate: postpone review date by 1 day if overdue
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await this.prisma.userProgress.update({
        where: { id: plant.id },
        data: {
          nextReviewDate:
            plant.nextReviewDate <= now ? tomorrow : plant.nextReviewDate,
        },
      });

      const updated = await this.prisma.userStats.update({
        where: { userId },
        data: {
          water: { decrement: 1 },
          xp: { increment: 5 },
        },
      });

      return {
        success: true,
        message:
          'Tưới nước thành công! Cây đã xanh tốt trở lại và bạn nhận được +5 XP! 💧',
        wateredCount: 1,
        xpEarned: 5,
        remainingWater: updated.water,
      };
    }

    throw new Error('Vui lòng chọn cây cần tưới hoặc chọn tưới tất cả.');
  }

  async fertilizeGarden(userId: number, body: { plantId: number }) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new BadRequestException('Không tìm thấy thông tin người dùng.');
    }

    if (stats.fertilizer <= 0) {
      throw new BadRequestException(
        'Bạn đã hết phân bón! Duy trì chuỗi Streak hoặc hoàn thành nhiệm vụ để nhận thêm.',
      );
    }

    const plant = await this.prisma.userProgress.findFirst({
      where: { id: body.plantId, userId },
    });
    if (!plant) {
      throw new BadRequestException('Không tìm thấy cây này trong vườn.');
    }

    // Accelerate plant growth: increment interval by 3 and repetitions by 1
    await this.prisma.userProgress.update({
      where: { id: plant.id },
      data: {
        interval: { increment: 3 },
        repetitions: { increment: 1 },
      },
    });

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        fertilizer: { decrement: 1 },
        xp: { increment: 15 },
      },
    });

    return {
      success: true,
      message:
        'Bón phân thành công! Cây tăng trưởng vượt bậc và bạn nhận +15 XP! 🌱✨',
      xpEarned: 15,
      remainingFertilizer: updated.fertilizer,
    };
  }

  async harvestGarden(userId: number, tzOffset: number) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new BadRequestException('Không tìm thấy thông tin người dùng.');
    }

    // Count productive trees
    const progresses = await this.prisma.userProgress.findMany({
      where: { userId, repetitions: { gt: 0 } },
    });

    let goldenTreesCount = 0;
    let saplingsCount = 0;
    let sproutsCount = 0;

    for (const p of progresses) {
      if (p.interval >= 30) goldenTreesCount++;
      else if (p.interval >= 7) saplingsCount++;
      else sproutsCount++;
    }

    const totalProductive = goldenTreesCount + saplingsCount + sproutsCount;
    if (totalProductive === 0) {
      throw new BadRequestException(
        'Bạn cần học và ôn tập ít nhất một từ vựng để cây sinh trưởng trước khi thu hoạch!',
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
        throw new BadRequestException(
          'Hôm nay bạn đã thu hoạch rồi, hãy quay lại vào ngày mai nhé!',
        );
      }
    }

    const reward = Math.min(
      35,
      Math.max(5, goldenTreesCount * 5 + saplingsCount * 2 + sproutsCount * 1),
    );

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        coins: { increment: reward },
        lastGardenHarvestDate: new Date(),
      },
    });

    return {
      success: true,
      harvestedCoins: reward,
      newBalance: updated.coins,
      message: `Thu hoạch thành công! Bạn nhận được +${reward} Xu ChongZi! 🪙`,
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
