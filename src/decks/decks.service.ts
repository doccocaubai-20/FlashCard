import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
@Injectable()
export class DecksService {

  constructor(private readonly prisma: PrismaService) { }


  async create(userId: number, data: any) {
    return this.prisma.deck.create({
      data: {
        title: data.title,
        description: data.description,
        userId: userId,
      },
    })
  }

  async findAllUserDecks(userId: number) {
    return this.prisma.deck.findMany({
      where: {
        OR: [
          { userId: userId },
          { isSystem: true }
        ]
      },
    })
  }
  async findOne(id: number) {
    return this.prisma.deck.findUnique({
      where: { id }
    })
  }

  async update(id: number, data: Prisma.DeckUpdateInput) {
    return this.prisma.deck.update({
      where: { id },
      data
    })
  }

  async remove(deckId: number, currentUserId: number, currentUserRole: string) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });

    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }

    if (currentUserRole === 'ADMIN') {
      return this.prisma.deck.delete({
        where: { id: deckId },
      });
    }

    if (deck.isSystem) {
      throw new ForbiddenException('Không thể xóa bộ thẻ mặc định của hệ thống!');
    }

    if (deck.userId !== currentUserId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên bộ thẻ của người khác!');
    }

    return this.prisma.deck.delete({
      where: { id: deckId },
    });
  }

  async removeSystemDeck(deckId: number) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });

    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }

    if (!deck.isSystem) {
      throw new ForbiddenException('Chỉ có thể xóa bộ thẻ mặc định của hệ thống!');
    }

    return this.prisma.deck.delete({
      where: { id: deckId },
    });
  }
}
