import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const totalUsers = await this.prisma.user.count();
    const totalDecks = await this.prisma.deck.count();
    const totalFlashcards = await this.prisma.flashcard.count();
    const totalStudyLogs = await this.prisma.studyLog.count();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeUsersToday = await this.prisma.studyLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: todayStart } },
    });
    const dau = activeUsersToday.length;

    const rawUsers = await this.prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        _count: { select: { studyLogs: true, progress: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const usersList = rawUsers.map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt,
      totalStudies: u._count.studyLogs, totalCardsLearned: u._count.progress,
    }));

    const signupsTrend: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const startOfDay = new Date();
      startOfDay.setDate(startOfDay.getDate() - i);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(startOfDay.getDate() + 1);
      const count = await this.prisma.user.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });
      signupsTrend.push({
        date: startOfDay.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }),
        count,
      });
    }

    return { overview: { totalUsers, totalDecks, totalFlashcards, totalStudyLogs, dau }, signupsTrend, users: usersList };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserRole(userId: number, role: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng!');
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async getAllDecks(filter?: string) {
    const where: any = {};
    if (filter === 'system') where.isSystem = true;
    else if (filter === 'public') where.isPublic = true;
    else if (filter === 'user') { where.isSystem = false; }

    return this.prisma.deck.findMany({
      where,
      select: {
        id: true, title: true, description: true,
        isSystem: true, isPublic: true, shareCode: true, createdAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
        _count: { select: { flashcards: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createSystemDeck(data: { title: string; description?: string }) {
    return this.prisma.deck.create({
      data: {
        title: data.title,
        description: data.description || '',
        isSystem: true,
        isPublic: true,
        userId: null,
      },
    });
  }

  async updateDeck(deckId: number, data: { title?: string; description?: string; isPublic?: boolean; isSystem?: boolean }) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Không tìm thấy bộ thẻ!');
    return this.prisma.deck.update({
      where: { id: deckId },
      data,
    });
  }

  async deleteDeck(deckId: number) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Không tìm thấy bộ thẻ!');
    // Delete all flashcards first, then progress, then the deck
    await this.prisma.userProgress.deleteMany({ where: { flashcard: { deckId } } });
    await this.prisma.studyLog.deleteMany({ where: { flashcard: { deckId } } });
    await this.prisma.flashcard.deleteMany({ where: { deckId } });
    await this.prisma.deck.delete({ where: { id: deckId } });
    return { message: 'Đã xóa bộ thẻ thành công!' };
  }
}
