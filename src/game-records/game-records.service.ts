import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GameRecordsService {
  constructor(private prisma: PrismaService) {}

  create(userId: number, data: any) {
    return this.prisma.gameRecord.create({
      data: {
        userId,
        gameType: data.gameType,
        level: data.level,
        score: data.score,
        accuracy: data.accuracy,
        duration: data.duration,
        details: data.details,
      },
    });
  }

  findAll(userId: number, gameType?: string, limit: number = 10) {
    return this.prisma.gameRecord.findMany({
      where: gameType ? { userId, gameType } : { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findBest(userId: number, gameType: string) {
    return this.prisma.gameRecord.findFirst({
      where: { userId, gameType },
      orderBy: { score: 'desc' },
    });
  }
}
