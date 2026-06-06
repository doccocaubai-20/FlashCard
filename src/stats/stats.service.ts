import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function getLocalDateString(date: Date, offsetMinutes: number): string {
  const localTime = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return localTime.toISOString().split('T')[0];
}

function getUtcStartOfDay(localDateStr: string, offsetMinutes: number): Date {
  const d = new Date(`${localDateStr}T00:00:00.000Z`);
  return new Date(d.getTime() - offsetMinutes * 60 * 1000);
}

function getUtcEndOfDay(localDateStr: string, offsetMinutes: number): Date {
  const d = new Date(`${localDateStr}T23:59:59.999Z`);
  return new Date(d.getTime() - offsetMinutes * 60 * 1000);
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
}
