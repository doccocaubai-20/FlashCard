import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CreateFlashcardDto } from './dto/create-flashcard.dto';
import { UpdateFlashcardDto } from './dto/update-flashcard.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
@Injectable()
export class FlashcardsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, role: string, data: any) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: data.deckId }
    })
    if (!deck) {
      throw new NotFoundException('Deck not found');
    }
    if (role !== 'ADMIN' && (deck.isSystem || deck.userId !== userId)) {
      throw new ForbiddenException('Bạn không có quyền thêm thẻ vào bộ này!');
    }
    try {
      return await this.prisma.flashcard.create({
        data: {
          ...data,

        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Flashcard already exists');
        }
      }
      throw error;
    }
  }

  async createBulk(userId: number, role: string, deckId: number, cards: any[]) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    })
    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    if (role !== 'ADMIN' && (deck.isSystem || deck.userId !== userId)) {
      throw new ForbiddenException('Bạn không có quyền thêm thẻ vào bộ này!');
    }
    const dataToInsert = cards.map((card) => ({
      ...card,
      deckId: deckId,
    }));

    const result = await this.prisma.flashcard.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    return {
      message: 'Thêm thẻ bài thành công',
      count: result.count,
    };
  }

  async findAllByDeckId(deckId: number) {
    if (await this.prisma.deck.findUnique({ where: { id: deckId } }) === null) {
      throw new NotFoundException('Deck not found');
    }
    return this.prisma.flashcard.findMany({
      where: {
        deck: {
          id: deckId
        }
      },
      orderBy: { id: 'desc' }
    });
  }

  async findOne(id: number) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id }
    })
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    return card;
  }

  update(id: number, updateFlashcardDto: Prisma.FlashcardUpdateInput) {
    return `This action updates a #${id} flashcard`;
  }

  remove(id: number) {
    return `This action removes a #${id} flashcard`;
  }
}
