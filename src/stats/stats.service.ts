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

const QUEST_TEMPLATES = [
  {
    type: 'STUDY_CARDS',
    title: 'Ôn tập thẻ flashcard',
    description: 'Ôn tập 20 thẻ từ vựng với thuật toán SRS',
    target: 20,
    xpReward: 25,
    coinReward: 15,
  },
  {
    type: 'AI_CHAT',
    title: 'Trò chuyện với AI Assistant',
    description: 'Hỏi đáp hoặc thực hành hội thoại với AI 5 lần',
    target: 5,
    xpReward: 20,
    coinReward: 10,
  },
  {
    type: 'DICTIONARY_LOOKUP',
    title: 'Tra cứu từ điển',
    description: 'Tra cứu ý nghĩa hoặc âm Hán-Việt của 3 từ vựng',
    target: 3,
    xpReward: 15,
    coinReward: 8,
  },
  {
    type: 'FAVORITE_WORD',
    title: 'Lưu từ vựng yêu thích',
    description: 'Lưu thêm 2 từ mới vào Sổ tay từ vựng của bạn',
    target: 2,
    xpReward: 15,
    coinReward: 8,
  },
  {
    type: 'PLAY_GAME',
    title: 'Đại chiến game HSK',
    description: 'Chơi 1 ván game lật thẻ, xếp câu hoặc rơi từ',
    target: 1,
    xpReward: 20,
    coinReward: 10,
  },
  {
    type: 'WRITE_PRACTICE',
    title: 'Luyện viết chữ Hán',
    description: 'Tập viết nét chữ Hán chuẩn xác 3 lần',
    target: 3,
    xpReward: 20,
    coinReward: 10,
  },
  {
    type: 'SPEAK_PRACTICE',
    title: 'Luyện phát âm tiếng Trung',
    description: 'Thu âm phát âm chuẩn 2 câu mẫu hoặc từ vựng',
    target: 2,
    xpReward: 20,
    coinReward: 10,
  },
];

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
      const localLastStudyStr = getLocalDateString(stats.lastStudyDate, tzOffset);
      const localTodayStr = getLocalDateString(new Date(), tzOffset);

      if (localTodayStr !== localLastStudyStr && !isConsecutiveDay(localLastStudyStr, localTodayStr)) {
        if (stats.currentStreak > 0) {
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
        data: { userId, xp: xpToAdd, coins: coinsToAdd },
      });
    } else {
      stats = await this.prisma.userStats.update({
        where: { userId },
        data: {
          xp: { increment: xpToAdd },
          coins: { increment: coinsToAdd },
        },
      });
    }
    return {
      xp: stats.xp,
      coins: stats.coins,
    };
  }

  async buyItem(userId: number, itemPrice: number) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats || stats.coins < itemPrice) {
      throw new Error('Số xu tích lũy không đủ để mua vật phẩm này.');
    }
    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        coins: { decrement: itemPrice },
      },
    });
    return {
      coins: updated.coins,
    };
  }

  async getDailyQuests(userId: number, tzOffset: number) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);

    // 1. Check if user already has quests generated for today
    let quests = await this.prisma.userQuest.findMany({
      where: {
        userId,
        dateStr: localTodayStr,
      },
      orderBy: { id: 'asc' },
    });

    // 2. If no quests exist, generate exactly 3 random unique quests
    if (quests.length === 0) {
      const selected = shuffleArray(QUEST_TEMPLATES).slice(0, 3);
      quests = [];
      for (const t of selected) {
        const q = await this.prisma.userQuest.create({
          data: {
            userId,
            questType: t.type,
            title: t.title,
            description: t.description,
            target: t.target,
            xpReward: t.xpReward,
            coinReward: t.coinReward,
            dateStr: localTodayStr,
          },
        });
        quests.push(q);
      }
    }

    return quests;
  }

  async incrementQuestProgress(
    userId: number,
    questType: string,
    amount: number,
    tzOffset: number,
  ) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);

    // 1. Find the active quest of this type for today
    const quest = await this.prisma.userQuest.findFirst({
      where: {
        userId,
        questType,
        dateStr: localTodayStr,
        completed: false,
      },
    });

    if (!quest) {
      return null;
    }

    // 2. Increment progress and check completion
    const newProgress = Math.min(quest.target, quest.progress + amount);
    const completed = newProgress >= quest.target;

    const updated = await this.prisma.userQuest.update({
      where: { id: quest.id },
      data: {
        progress: newProgress,
        completed,
      },
    });

    // 3. If newly completed, award rewards
    if (completed && !quest.completed) {
      await this.updateXPAndCoins(userId, quest.xpReward, quest.coinReward);
    }

    return updated;
  }
}
