import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CreateFlashcardDto } from './dto/create-flashcard.dto';
import { UpdateFlashcardDto } from './dto/update-flashcard.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
function mapFlashcardToFrontend(card: any) {
  return {
    ...card,
    character: card.hanzi,
    front: card.hanzi,
    back: card.pinyin && card.meaning ? `${card.pinyin} | ${card.meaning}` : (card.meaning || card.pinyin || ''),
    example: card.exampleHanzi 
      ? `${card.exampleHanzi}${card.examplePinyin ? ` (${card.examplePinyin})` : ''}${card.exampleMeaning ? ` - ${card.exampleMeaning}` : ''}`
      : undefined
  };
}

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
      const card = await this.prisma.flashcard.create({
        data: {
          ...data,
        }
      });
      return mapFlashcardToFrontend(card);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Flashcard already exists');
        }
      }
      throw error;
    }
  }

  async bulkImport(userId: number, role: string, items: any[]) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }
    const deckId = +items[0].deckId;
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck) {
      throw new NotFoundException('Deck not found');
    }
    if (role !== 'ADMIN' && (deck.isSystem || deck.userId !== userId)) {
      throw new ForbiddenException('Bạn không có quyền thêm thẻ vào bộ này!');
    }

    const dataToInsert = items.map((item) => {
      let pinyin = item.pinyin || '';
      let meaning = item.meaning || '';
      if (item.back && !pinyin && !meaning) {
        const parts = item.back.split('|');
        if (parts.length >= 2) {
          pinyin = parts[0].trim();
          meaning = parts.slice(1).join('|').trim();
        } else {
          meaning = item.back.trim();
        }
      }
      return {
        deckId: deckId,
        hanzi: item.hanzi || item.front || '',
        pinyin: pinyin,
        meaning: meaning,
        radicals: item.radicals || null,
        strokeData: item.strokeData || null,
        audioUrl: item.audioUrl || null,
        exampleHanzi: item.exampleHanzi || null,
        examplePinyin: item.examplePinyin || null,
        exampleMeaning: item.exampleMeaning || null,
      };
    });

    await this.prisma.flashcard.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    const cards = await this.prisma.flashcard.findMany({
      where: { deckId },
      orderBy: { id: 'desc' },
    });

    return cards.map(mapFlashcardToFrontend);
  }

  async findAllByDeckId(deckId: number) {
    if (await this.prisma.deck.findUnique({ where: { id: deckId } }) === null) {
      throw new NotFoundException('Deck not found');
    }
    const cards = await this.prisma.flashcard.findMany({
      where: {
        deck: {
          id: deckId
        }
      },
      orderBy: { id: 'desc' }
    });
    return cards.map(mapFlashcardToFrontend);
  }

  async findOne(id: number) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id }
    })
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    return mapFlashcardToFrontend(card);
  }

  async update(id: number, data: Prisma.FlashcardUpdateInput) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    const updatedCard = await this.prisma.flashcard.update({
      where: { id },
      data,
    });
    return mapFlashcardToFrontend(updatedCard);
  }

  async remove(id: number) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    await this.prisma.flashcard.delete({
      where: { id },
    });
    return { success: true, message: 'Flashcard deleted' };
  }
}
