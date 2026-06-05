import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        stats: {
          select: {
            currentStreak: true,
            longestStreak: true,
          },
        },
        _count: {
          select: {
            progress: true,
          },
        },
        progress: {
          select: {
            repetitions: true,
          },
        },
      },
    });

    const rankedUsers = users.map((u) => {
      const totalRepetitions = u.progress.reduce((sum, p) => sum + p.repetitions, 0);
      const currentStreak = u.stats?.currentStreak || 0;
      // Score calculation: 100 points per streak day, 10 points per card repetition
      const score = currentStreak * 100 + totalRepetitions * 10;

      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        currentStreak,
        longestStreak: u.stats?.longestStreak || 0,
        totalCardsLearned: u._count.progress,
        totalRepetitions,
        score,
      };
    });

    // Sort by score descending, then by repetitions descending
    return rankedUsers
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.totalRepetitions - a.totalRepetitions;
      })
      .slice(0, 20);
  }

  async shareDeck(deckId: number, userId: number) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });

    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ từ vựng!');
    }

    if (deck.userId !== userId) {
      throw new BadRequestException('Bạn chỉ có quyền chia sẻ bộ từ vựng tự tạo của chính mình!');
    }

    if (deck.isSystem) {
      throw new BadRequestException('Không thể chia sẻ bộ từ vựng hệ thống!');
    }

    if (deck.isPublic && deck.shareCode) {
      return { shareCode: deck.shareCode, title: deck.title };
    }

    // Generate unique random 8 character uppercase share code: DEC-XXXXXX
    let shareCode = '';
    let isUnique = false;
    while (!isUnique) {
      const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      shareCode = `DEC-${randStr}`;
      const existing = await this.prisma.deck.findUnique({
        where: { shareCode },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    await this.prisma.deck.update({
      where: { id: deckId },
      data: {
        isPublic: true,
        shareCode,
      },
    });

    return { shareCode, title: deck.title };
  }

  async importDeck(shareCode: string, userId: number) {
    const cleanCode = shareCode.trim().toUpperCase();
    const originalDeck = await this.prisma.deck.findUnique({
      where: { shareCode: cleanCode },
      include: {
        flashcards: true,
      },
    });

    if (!originalDeck) {
      throw new NotFoundException('Mã chia sẻ không tồn tại hoặc đã bị gỡ bỏ!');
    }

    // Verify it is a public deck
    if (!originalDeck.isPublic) {
      throw new BadRequestException('Bộ từ vựng này không ở chế độ công khai!');
    }

    // 1. Create a copy of the deck for the importing user
    const newDeck = await this.prisma.deck.create({
      data: {
        title: originalDeck.title,
        description: originalDeck.description ? `${originalDeck.description} (Nguồn: Bản chia sẻ)` : 'Được nhập từ bản chia sẻ công khai.',
        userId,
        isSystem: false,
        isPublic: false,
        shareCode: null,
      },
    });

    // 2. Clone all flashcards to the new deck
    if (originalDeck.flashcards.length > 0) {
      const cloneData = originalDeck.flashcards.map((card) => ({
        deckId: newDeck.id,
        hanzi: card.hanzi,
        pinyin: card.pinyin,
        meaning: card.meaning,
        radicals: card.radicals,
        strokeData: card.strokeData,
        audioUrl: card.audioUrl,
        exampleHanzi: card.exampleHanzi,
        examplePinyin: card.examplePinyin,
        exampleMeaning: card.exampleMeaning,
      }));

      await this.prisma.flashcard.createMany({
        data: cloneData,
      });
    }

    return newDeck;
  }
}
