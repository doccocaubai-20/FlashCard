import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const HSK_MAPPING = {
  你: { hsk2: '1', hsk3: '1' },
  好: { hsk2: '1', hsk3: '1' },
  谢谢: { hsk2: '1', hsk3: '1' },
  再见: { hsk2: '1', hsk3: '1' },
  水: { hsk2: '1', hsk3: '1' },
  学习: { hsk2: '2', hsk3: '1' },
  高兴: { hsk2: '2', hsk3: '1' },
  电脑: { hsk2: '3', hsk3: '2' },
  简单: { hsk2: '3', hsk3: '2' },
  经理: { hsk2: '4', hsk3: '3' },
  会议: { hsk2: '4', hsk3: '3' },
  环境: { hsk2: '5', hsk3: '4' },
  贸易: { hsk2: '6', hsk3: '5' },
  谈判: { hsk2: '6', hsk3: '6' },
  儒家: { hsk2: '6', hsk3: '7-9' },
};

function getHskLevels(hanzi: string) {
  return HSK_MAPPING[hanzi] || { hsk2: null, hsk3: null };
}

function mapFlashcardToFrontend(card: any) {
  const levels = getHskLevels(card.hanzi);
  return {
    ...card,
    character: card.hanzi,
    front: card.hanzi,
    back:
      card.pinyin && card.meaning
        ? `${card.pinyin} | ${card.meaning}`
        : card.meaning || card.pinyin || '',
    example: card.exampleHanzi
      ? `${card.exampleHanzi}${card.examplePinyin ? ` (${card.examplePinyin})` : ''}${card.exampleMeaning ? ` - ${card.exampleMeaning}` : ''}`
      : undefined,
    hsk2Level: levels.hsk2,
    hsk3Level: levels.hsk3,
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

import { StatsService } from '../stats/stats.service';

@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  async getTodayCards(
    userId: number,
    tzOffset: number,
    extra?: number,
    deckId?: number,
  ) {
    // 1. Get due progresses
    const dueProgresses = await this.prisma.userProgress.findMany({
      where: {
        userId,
        nextReviewDate: {
          lte: new Date(),
        },
        flashcard: deckId ? { deckId } : undefined,
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
        OR: [{ userId }, { isSystem: true }],
      },
      select: { id: true },
    });
    const deckIds = decks.map((d) => d.id);

    // 4. Find cards that don't have progress yet for this user
    const newCards = await this.prisma.flashcard.findMany({
      where: {
        deckId: deckId ? deckId : { in: deckIds },
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

  async submitReview(
    userId: number,
    body: { cardId: number; rating: number; tzOffset?: number },
  ) {
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

    if (quality === 4) {
      easeFactor = Math.min(3.0, easeFactor + 0.15); // Boost ease factor for Easy words
    } else {
      easeFactor = Math.max(
        1.3,
        easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      );
    }

    if (quality < 3) {
      repetitions = 0;
      interval = 1;
    } else {
      repetitions += 1;
      if (quality === 4) {
        // Easy cards get a larger initial interval (4 days instead of 1)
        if (repetitions === 1) {
          interval = 4;
        } else if (repetitions === 2) {
          interval = 8;
        } else {
          interval = Math.round(progress.interval * easeFactor * 1.3) || 4;
        }
      } else {
        // Good cards (quality = 3)
        if (repetitions === 1) {
          interval = 1;
        } else if (repetitions === 2) {
          interval = 6;
        } else {
          interval = Math.round(progress.interval * easeFactor) || 1;
        }
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
      const localLastStudyStr = getLocalDateString(
        stats.lastStudyDate,
        tzOffset,
      );

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

    // Award XP and Coins based on Streak Combo Multiplier
    let xpReward = 5;
    let coinReward = 2;
    if (currentStreak >= 14) {
      xpReward = 10;
      coinReward = 4;
    } else if (currentStreak >= 7) {
      xpReward = 7;
      coinReward = 3;
    }

    await this.statsService.updateXPAndCoins(userId, xpReward, coinReward);

    // Update daily quest progress for STUDY_CARDS
    await this.statsService.incrementQuestProgress(userId, 'STUDY_CARDS', 1, tzOffset);


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

  async getAllCards(userId: number) {
    const decks = await this.prisma.deck.findMany({
      where: {
        OR: [{ userId }, { isSystem: true }],
      },
      select: { id: true },
    });
    const deckIds = decks.map((d) => d.id);
    const cards = await this.prisma.flashcard.findMany({
      where: {
        deckId: { in: deckIds },
      },
      include: {
        progresses: {
          where: { userId },
        },
      },
    });
    return cards.map((c) => {
      const p = c.progresses[0];
      return {
        ...mapFlashcardToFrontend(c),
        progressId: p?.id,
        interval: p?.interval ?? 0,
        easeFactor: p?.easeFactor ?? 2.5,
        repetitions: p?.repetitions ?? 0,
        nextReviewDate: p?.nextReviewDate,
      };
    });
  }
}
