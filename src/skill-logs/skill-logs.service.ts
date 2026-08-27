import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SkillLogsService {
  constructor(private prisma: PrismaService) {}

  create(userId: number, data: any) {
    return this.prisma.userSkillLog.create({
      data: {
        userId,
        skillType: data.skillType,
        targetId: data.targetId,
        level: data.level,
        score: data.score,
        accuracy: data.accuracy,
        details: data.details,
        duration: data.duration,
      },
    });
  }

  findAll(userId: number, skillType?: string, limit: number = 20) {
    return this.prisma.userSkillLog.findMany({
      where: skillType ? { userId, skillType } : { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  getStats(userId: number) {
    return this.prisma.userSkillLog.groupBy({
      by: ['skillType'],
      where: { userId },
      _count: { _all: true },
      _avg: { score: true },
    });
  }
}
