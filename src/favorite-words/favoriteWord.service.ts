import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFavoriteWordDto } from './dto/favoriteWord.dto';

import { StatsService } from '../stats/stats.service';

@Injectable()
export class FavoriteWordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  async getAllFavoriteWords(userId: number) {
    return this.prisma.favoriteWord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavoriteWord(userId: number, dto: CreateFavoriteWordDto) {
    let sv = dto.sv || null;

    // Tự động truy vấn âm Hán-Việt từ từ điển nếu không được truyền từ frontend
    if (!sv && dto.hanzi) {
      try {
        const dictWord = await this.prisma.dictionaryWord.findFirst({
          where: { s: dto.hanzi },
          select: { sv: true },
        });

        if (dictWord && dictWord.sv) {
          sv = dictWord.sv;
        } else {
          // Phân tách từ ghép thành chữ đơn để ghép âm Hán-Việt
          const chars = Array.from(dto.hanzi);
          if (chars.length > 1) {
            const parts: string[] = [];
            for (const char of chars) {
              const charWord = await this.prisma.dictionaryWord.findFirst({
                where: { s: char },
                select: { sv: true },
              });
              parts.push(charWord?.sv || `[${char}]`);
            }
            sv = parts.join(' ').replace(/\s+/g, ' ').trim();
          }
        }
      } catch (err) {
        console.error('Failed to auto-lookup SV in FavoriteWordService:', err);
      }
    }

    try {
      const favWord = await this.prisma.favoriteWord.create({
        data: {
          userId,
          hanzi: dto.hanzi,
          pinyin: dto.pinyin || null,
          sv,
          vi: dto.vi || null,
        },
      });

      // Update daily quest progress for FAVORITE_WORD
      await this.statsService.incrementQuestProgress(userId, 'FAVORITE_WORD', 1, 420);

      return favWord;
    } catch (error) {
      const err = error as any;
      if (err?.code === 'P2002') {
        throw new ConflictException('Từ này đã có trong mục yêu thích!');
      }
      throw error;
    }
  }

  async deleteFavoriteWord(userId: number, id: number) {
    const fav = await this.prisma.favoriteWord.findFirst({
      where: { id, userId },
    });
    if (!fav) {
      throw new NotFoundException('Không tìm thấy từ yêu thích!');
    }
    await this.prisma.favoriteWord.delete({
      where: { id },
    });
    return { success: true, message: 'Đã xóa khỏi mục yêu thích' };
  }

  async deleteFavoriteWordByHanzi(userId: number, hanzi: string) {
    const fav = await this.prisma.favoriteWord.findFirst({
      where: {
        userId,
        hanzi,
      },
    });
    if (!fav) {
      throw new NotFoundException('Không tìm thấy từ yêu thích!');
    }
    await this.prisma.favoriteWord.delete({
      where: {
        id: fav.id,
      },
    });
    return { success: true, message: 'Đã xóa khỏi mục yêu thích' };
  }
}
