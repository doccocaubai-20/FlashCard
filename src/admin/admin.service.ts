import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    // 1. Basic counts
    const totalUsers = await this.prisma.user.count();
    const totalDecks = await this.prisma.deck.count();
    const totalFlashcards = await this.prisma.flashcard.count();
    const totalStudyLogs = await this.prisma.studyLog.count();

    // 2. DAU (Daily Active Users) - Users with study logs today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeUsersToday = await this.prisma.studyLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: todayStart,
        },
      },
    });
    const dau = activeUsersToday.length;

    // 3. User lists with statistics
    const rawUsers = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            studyLogs: true,
            progress: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit list size
    });

    const usersList = rawUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      totalStudies: u._count.studyLogs,
      totalCardsLearned: u._count.progress,
    }));

    // 4. Signups in the last 7 days
    const signupsTrend: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const startOfDay = new Date();
      startOfDay.setDate(startOfDay.getDate() - i);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(startOfDay.getDate() + 1);

      const count = await this.prisma.user.count({
        where: {
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      });

      signupsTrend.push({
        date: startOfDay.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }),
        count,
      });
    }

    return {
      overview: {
        totalUsers,
        totalDecks,
        totalFlashcards,
        totalStudyLogs,
        dau,
      },
      signupsTrend,
      users: usersList,
    };
  }

  async getAllUsers() {
    const rawUsers = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rawUsers;
  }
}
