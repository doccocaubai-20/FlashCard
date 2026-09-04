import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WeakWordsService {
  constructor(private prisma: PrismaService) {}

  upsert(
    userId: number,
    data: { hanzi: string; pinyin?: string; meaning?: string; source: string },
  ) {
    return this.prisma.userWeakWord.upsert({
      where: { userId_hanzi: { userId, hanzi: data.hanzi } },
      create: {
        userId,
        hanzi: data.hanzi,
        pinyin: data.pinyin,
        meaning: data.meaning,
        source: data.source,
        mistakeCount: 1,
      },
      update: {
        mistakeCount: { increment: 1 },
        lastMistakeAt: new Date(),
        source: data.source,
        pinyin: data.pinyin || undefined,
        meaning: data.meaning || undefined,
      },
    });
  }

  findAll(userId: number) {
    return this.prisma.userWeakWord.findMany({
      where: { userId },
      orderBy: { mistakeCount: 'desc' },
    });
  }

  remove(id: number, userId: number) {
    return this.prisma.userWeakWord.deleteMany({
      where: { id, userId },
    });
  }
}
