import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function mapFlashcardToFrontend(card: any) {
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
import { FSRS, Card, Rating, State } from './fsrs.helper';

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
    topicId?: number,
  ) {
    const localTodayStr = getLocalDateString(new Date(), tzOffset);
    const startOfLocalToday = getUtcStartOfDay(localTodayStr, tzOffset);
    const endOfLocalToday = getUtcEndOfDay(localTodayStr, tzOffset);

    // 1. Fetch due progresses, user stats (upserted to ensure exists), and completed today count in parallel to avoid network round-trip bottlenecks
    const [dueProgresses, stats, completedTodayCount] = await Promise.all([
      this.prisma.userProgress.findMany({
        where: {
          userId,
          nextReviewDate: {
            lte: new Date(),
          },
          flashcard: deckId
            ? { deckId, topicId: topicId ? topicId : undefined }
            : topicId
              ? { topicId }
              : undefined,
        },
        include: {
          flashcard: true,
        },
      }),
      this.prisma.userStats.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      this.prisma.studyLog.count({
        where: {
          userId,
          createdAt: {
            gte: startOfLocalToday,
            lte: endOfLocalToday,
          },
          flashcard: deckId
            ? { deckId, topicId: topicId ? topicId : undefined }
            : topicId
              ? { topicId }
              : undefined,
        },
      }),
    ]);

    const mappedDueCards = dueProgresses.map((p) => ({
      ...mapFlashcardToFrontend(p.flashcard),
      progressId: p.id,
      interval: p.interval,
      easeFactor: p.easeFactor,
      repetitions: p.repetitions,
      nextReviewDate: p.nextReviewDate,
      stability: p.stability,
      difficulty: p.difficulty,
      lapses: p.lapses,
      state: p.state,
      lastReview: p.lastReview,
    }));

    let newCardsCount = 0;
    if (extra !== undefined) {
      newCardsCount = extra;
    } else {
      const remaining = stats.dailyTarget - completedTodayCount;
      if (remaining > 0 && mappedDueCards.length < remaining) {
        newCardsCount = remaining - mappedDueCards.length;
      }
    }

    if (newCardsCount <= 0) {
      return mappedDueCards;
    }

    // 2. Fetch user or system decks to pull new cards from only if deckId is not provided
    let deckIds: number[] = [];
    if (!deckId) {
      const decks = await this.prisma.deck.findMany({
        where: {
          OR: [{ userId }, { isSystem: true }],
        },
        select: { id: true },
      });
      deckIds = decks.map((d) => d.id);
    }

    // 4. Find cards that don't have progress yet for this user
    const newCards = await this.prisma.flashcard.findMany({
      where: {
        deckId: deckId ? deckId : { in: deckIds },
        topicId: topicId ? topicId : undefined,
        progresses: {
          none: {
            userId: userId,
          },
        },
      },
      take: newCardsCount,
    });

    if (newCards.length > 0) {
      await this.prisma.userProgress.createMany({
        data: newCards.map((card) => ({
          userId,
          flashcardId: card.id,
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReviewDate: new Date(),
          stability: 0.0,
          difficulty: 0.0,
          lapses: 0,
          state: 0,
          lastReview: null,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch the newly created progresses along with their flashcard relations in 1 query
    const createdProgresses = await this.prisma.userProgress.findMany({
      where: {
        userId,
        flashcardId: { in: newCards.map((c) => c.id) },
      },
      include: {
        flashcard: true,
      },
    });

    const mappedNewCards = createdProgresses.map((p) => ({
      ...mapFlashcardToFrontend(p.flashcard),
      progressId: p.id,
      interval: p.interval,
      easeFactor: p.easeFactor,
      repetitions: p.repetitions,
      nextReviewDate: p.nextReviewDate,
      stability: p.stability,
      difficulty: p.difficulty,
      lapses: p.lapses,
      state: p.state,
      lastReview: p.lastReview,
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
          stability: 0.0,
          difficulty: 0.0,
          lapses: 0,
          state: 0,
          lastReview: null,
        },
      });
    }

    // 2. FSRS-4.5 algorithm calculations
    const fsrs = new FSRS();
    const now = new Date();

    let cardState = progress.state;
    let cardStability = progress.stability;
    let cardDifficulty = progress.difficulty;
    let cardLapses = progress.lapses;
    let cardLastReview = progress.lastReview;

    // Migration path: initialize values for existing SM-2 cards
    if (
      progress.repetitions > 0 &&
      progress.stability === 0 &&
      progress.difficulty === 0
    ) {
      cardStability = progress.interval || 1;
      cardDifficulty = Math.max(
        1,
        Math.min(10, 11 - (progress.easeFactor - 1.3) * 5),
      );
      cardLapses = 0;
      cardState = State.Review;
      cardLastReview = new Date(
        progress.nextReviewDate.getTime() -
          (progress.interval || 1) * 24 * 60 * 60 * 1000,
      );
    }

    let elapsedDays = 0;
    if (cardLastReview) {
      const diffTime = Math.max(0, now.getTime() - cardLastReview.getTime());
      elapsedDays = diffTime / (1000 * 60 * 60 * 24);
    }

    const fsrsCard: Card = {
      due: progress.nextReviewDate,
      stability: cardStability,
      difficulty: cardDifficulty,
      elapsedDays,
      reps: progress.repetitions,
      lapses: cardLapses,
      state: cardState as State,
      lastReview: cardLastReview || undefined,
    };

    const schedulingInfo = fsrs.schedule(fsrsCard, body.rating as Rating, now);
    const chosenInfo = schedulingInfo[body.rating as Rating];

    const nextCard = chosenInfo.card;
    const interval = chosenInfo.interval;

    const nextReviewDate = new Date();
    nextReviewDate.setDate(now.getDate() + interval);
    const localDateStr = getLocalDateString(nextReviewDate, tzOffset);
    const startOfReviewDay = getUtcStartOfDay(localDateStr, tzOffset);

    // 3. Save progress, create study log, and update streak inside a Transaction
    const { updatedProgress, currentStreak } = await this.prisma.$transaction(
      async (tx) => {
        const upProgress = await tx.userProgress.update({
          where: { id: progress.id },
          data: {
            interval,
            repetitions: nextCard.reps,
            nextReviewDate: startOfReviewDay,
            stability: nextCard.stability,
            difficulty: nextCard.difficulty,
            lapses: nextCard.lapses,
            state: nextCard.state,
            lastReview: now,
          },
          include: {
            flashcard: true,
          },
        });

        await tx.studyLog.create({
          data: {
            userId,
            cardId: body.cardId,
            rating: body.rating,
          },
        });

        const localTodayStr = getLocalDateString(now, tzOffset);

        let stats = await tx.userStats.findUnique({
          where: { userId },
        });
        if (!stats) {
          stats = await tx.userStats.create({
            data: { userId },
          });
        }

        let cStreak = stats.currentStreak;
        let lStreak = stats.longestStreak;

        if (stats.lastStudyDate) {
          const localLastStudyStr = getLocalDateString(
            stats.lastStudyDate,
            tzOffset,
          );

          if (localTodayStr !== localLastStudyStr) {
            const consecutive = isConsecutiveDay(
              localLastStudyStr,
              localTodayStr,
            );
            if (consecutive) {
              cStreak += 1;
              if (cStreak > lStreak) {
                lStreak = cStreak;
              }
            } else {
              cStreak = 1;
            }
          }
        } else {
          cStreak = 1;
          lStreak = 1;
        }

        await tx.userStats.update({
          where: { userId },
          data: {
            currentStreak: cStreak,
            longestStreak: lStreak,
            lastStudyDate: now,
          },
        });

        return { updatedProgress: upProgress, currentStreak: cStreak };
      },
    );

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
    await this.statsService.incrementQuestProgress(
      userId,
      'STUDY_CARDS',
      1,
      tzOffset,
    );

    // 6. Return mapped card progress
    return {
      ...mapFlashcardToFrontend(updatedProgress.flashcard),
      progressId: updatedProgress.id,
      interval: updatedProgress.interval,
      easeFactor: updatedProgress.easeFactor,
      repetitions: updatedProgress.repetitions,
      nextReviewDate: updatedProgress.nextReviewDate,
      stability: updatedProgress.stability,
      difficulty: updatedProgress.difficulty,
      lapses: updatedProgress.lapses,
      state: updatedProgress.state,
      lastReview: updatedProgress.lastReview,
    };
  }

  async getAllCards(
    userId: number,
    deckId?: number,
    limit?: number,
    offset?: number,
    topicId?: number,
  ) {
    let deckIds: number[];
    if (deckId !== undefined) {
      deckIds = [deckId];
    } else {
      const decks = await this.prisma.deck.findMany({
        where: {
          OR: [{ userId }, { isSystem: true }],
        },
        select: { id: true },
      });
      deckIds = decks.map((d) => d.id);
    }

    // Get total count matching the query
    const totalCount = await this.prisma.flashcard.count({
      where: {
        deckId: { in: deckIds },
        topicId: topicId ? topicId : undefined,
      },
    });

    const cards = await this.prisma.flashcard.findMany({
      where: {
        deckId: { in: deckIds },
        topicId: topicId ? topicId : undefined,
      },
      include: {
        progresses: {
          where: { userId },
        },
      },
      orderBy: { id: 'desc' },
      take: limit,
      skip: offset,
    });

    const mappedCards = cards.map((c) => {
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

    if (limit !== undefined) {
      return { cards: mappedCards, totalCount };
    }
    return mappedCards;
  }
}
