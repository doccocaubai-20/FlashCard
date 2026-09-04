import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GrammarProgressService {
  constructor(private prisma: PrismaService) {}

  upsert(
    userId: number,
    data: { grammarId: string; level: string; score: number; correct: boolean },
  ) {
    return this.prisma.userGrammarProgress.upsert({
      where: { userId_grammarId: { userId, grammarId: data.grammarId } },
      create: {
        userId,
        grammarId: data.grammarId,
        level: data.level,
        masteryScore: data.score,
        attempts: 1,
        correctCount: data.correct ? 1 : 0,
      },
      update: {
        masteryScore: data.score,
        attempts: { increment: 1 },
        correctCount: data.correct ? { increment: 1 } : undefined,
        lastPracticedAt: new Date(),
      },
    });
  }

  findAll(userId: number) {
    return this.prisma.userGrammarProgress.findMany({
      where: { userId },
      orderBy: { lastPracticedAt: 'desc' },
    });
  }
}
