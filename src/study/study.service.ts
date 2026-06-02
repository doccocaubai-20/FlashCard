import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function mapFlashcardToFrontend(card: any) {
  return {
    ...card,
    character: card.hanzi,
    front: card.hanzi,
    back: card.pinyin && card.meaning ? `${card.pinyin} | ${card.meaning}` : (card.meaning || card.pinyin || ''),
    example: card.exampleHanzi 
      ? `${card.exampleHanzi}${card.examplePinyin ? ` (${card.examplePinyin})` : ''}${card.exampleMeaning ? ` - ${card.exampleMeaning}` : ''}`
      : undefined
  };
}

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

function isConsecutiveDay(day1: string, day2: string): boolean {
  const d1 = new Date(day1);
  const d2 = new Date(day2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayCards(userId: number, tzOffset: number, extra?: number) {
    // 1. Get due progresses
    const dueProgresses = await this.prisma.userProgress.findMany({
      where: {
        userId,
        nextReviewDate: {
          lte: new Date(),
        },
      },
      include: {
        flashcard: true,
      },
    });

    const mappedDueCards = dueProgresses.map((p) => ({
      ...mapFlashcardToFrontend(p.flashcard),
      progressId: p.id,
      interval: p.interval,
      easeFactor: p.easeFactor,
      repetitions: p.repetitions,
      nextReviewDate: p.nextReviewDate,
    }));

    // 2. Fetch UserStats for goal target
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    let newCardsCount = 0;
    if (extra !== undefined) {
      newCardsCount = extra;
    } else {
      // Find local today dates
      const localTodayStr = getLocalDateString(new Date(), tzOffset);
      const startOfLocalToday = getUtcStartOfDay(localTodayStr, tzOffset);
      const endOfLocalToday = getUtcEndOfDay(localTodayStr, tzOffset);

      // Check how many cards already studied today from logs
      const completedTodayCount = await this.prisma.studyLog.count({
        where: {
          userId,
          createdAt: {
            gte: startOfLocalToday,
            lte: endOfLocalToday,
          },
        },
      });

      const remaining = stats.dailyTarget - completedTodayCount;
      if (remaining > 0 && mappedDueCards.length < remaining) {
        newCardsCount = remaining - mappedDueCards.length;
      }
    }

    if (newCardsCount <= 0) {
      return mappedDueCards;
    }

    // 3. Fetch user or system decks to pull new cards from
    const decks = await this.prisma.deck.findMany({
      where: {
        OR: [
          { userId },
          { isSystem: true },
        ],
      },
      select: { id: true },
    });
    const deckIds = decks.map((d) => d.id);

    // 4. Find cards that don't have progress yet for this user
    const newCards = await this.prisma.flashcard.findMany({
      where: {
        deckId: { in: deckIds },
        progresses: {
          none: {
            userId: userId,
          },
        },
      },
      take: newCardsCount,
    });

    // 5. Create progresses for these new cards
    const createdProgresses: any[] = [];
    for (const card of newCards) {
      const progress = await this.prisma.userProgress.create({
        data: {
          userId,
          flashcardId: card.id,
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReviewDate: new Date(), // due immediately
        },
        include: {
          flashcard: true,
        },
      });
      createdProgresses.push(progress);
    }

    const mappedNewCards = createdProgresses.map((p) => ({
      ...mapFlashcardToFrontend(p.flashcard),
      progressId: p.id,
      interval: p.interval,
      easeFactor: p.easeFactor,
      repetitions: p.repetitions,
      nextReviewDate: p.nextReviewDate,
    }));

    return [...mappedDueCards, ...mappedNewCards];
  }

  async submitReview(userId: number, body: { cardId: number; rating: number; tzOffset?: number }) {
    const tzOffset = body.tzOffset !== undefined ? body.tzOffset : 420;

    // 1. Check if progress exists
    let progress = await this.prisma.userProgress.findUnique({
      where: {
        userId_flashcardId: {
          userId,
          flashcardId: body.cardId,
        },
      },
    });

    if (!progress) {
      progress = await this.prisma.userProgress.create({
        data: {
          userId,
          flashcardId: body.cardId,
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReviewDate: new Date(),
        },
      });
    }

    // 2. SM-2 algorithm calculations
    const quality = body.rating; // 1-4 rating mapped directly to quality
    let easeFactor = progress.easeFactor;
    let repetitions = progress.repetitions;
    let interval = progress.interval;

    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    if (quality < 3) {
      repetitions = 0;
      interval = 1;
    } else {
      repetitions += 1;
      if (repetitions === 1) {
        interval = 1;
      } else if (repetitions === 2) {
        interval = 6;
      } else {
        interval = Math.round(progress.interval * easeFactor) || 1;
      }
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);

    // 3. Save progress
    const updatedProgress = await this.prisma.userProgress.update({
      where: { id: progress.id },
      data: {
        interval,
        easeFactor: Number(easeFactor.toFixed(2)),
        repetitions,
        nextReviewDate,
      },
      include: {
        flashcard: true,
      },
    });

    // 4. Create study log
    await this.prisma.studyLog.create({
      data: {
        userId,
        cardId: body.cardId,
        rating: body.rating,
      },
    });

    // 5. Update user stats streak
    const now = new Date();
    const localTodayStr = getLocalDateString(now, tzOffset);

    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }

    let currentStreak = stats.currentStreak;
    let longestStreak = stats.longestStreak;

    if (stats.lastStudyDate) {
      const localLastStudyStr = getLocalDateString(stats.lastStudyDate, tzOffset);

      if (localTodayStr !== localLastStudyStr) {
        const consecutive = isConsecutiveDay(localLastStudyStr, localTodayStr);
        if (consecutive) {
          currentStreak += 1;
          if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
          }
        } else {
          currentStreak = 1;
        }
      }
    } else {
      currentStreak = 1;
      longestStreak = 1;
    }

    await this.prisma.userStats.update({
      where: { userId },
      data: {
        currentStreak,
        longestStreak,
        lastStudyDate: now,
      },
    });

    // 6. Return mapped card progress
    return {
      ...mapFlashcardToFrontend(updatedProgress.flashcard),
      progressId: updatedProgress.id,
      interval: updatedProgress.interval,
      easeFactor: updatedProgress.easeFactor,
      repetitions: updatedProgress.repetitions,
      nextReviewDate: updatedProgress.nextReviewDate,
    };
  }
}
