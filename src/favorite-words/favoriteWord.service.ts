import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFavoriteWordDto } from './dto/favoriteWord.dto';

@Injectable()
export class FavoriteWordService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllFavoriteWords(userId: number) {
    return this.prisma.favoriteWord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavoriteWord(userId: number, dto: CreateFavoriteWordDto) {
    try {
      return await this.prisma.favoriteWord.create({
        data: {
          userId,
          hanzi: dto.hanzi,
          pinyin: dto.pinyin || null,
          sv: dto.sv || null,
          vi: dto.vi || null,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
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
