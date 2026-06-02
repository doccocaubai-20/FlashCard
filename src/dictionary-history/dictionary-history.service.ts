import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateHistoryDto } from './dto/create-history.dto';

@Injectable()
export class DictionaryHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    return this.prisma.dictionaryHistory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async createOrUpdate(userId: number, dto: CreateHistoryDto) {
    const updateData: any = {
      pinyin: dto.pinyin,
      sv: dto.sv,
      vi: dto.vi,
    };
    if (dto.aiExplanation !== undefined) {
      updateData.aiExplanation = dto.aiExplanation;
    }

    return this.prisma.dictionaryHistory.upsert({
      where: {
        userId_hanzi: {
          userId,
          hanzi: dto.hanzi,
        },
      },
      update: updateData,
      create: {
        userId,
        hanzi: dto.hanzi,
        pinyin: dto.pinyin,
        sv: dto.sv,
        vi: dto.vi,
        aiExplanation: dto.aiExplanation || null,
      },
    });
  }

  async clearHistory(userId: number) {
    return this.prisma.dictionaryHistory.deleteMany({
      where: { userId },
    });
  }
}
