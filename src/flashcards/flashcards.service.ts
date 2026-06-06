import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
function mapFlashcardToFrontend(card: any) {
  return {
    ...card,
    character: card.hanzi,
    front: card.hanzi,
    back:
      card.pinyin && card.meaning
        ? `${card.pinyin} | ${card.meaning}`
        : card.meaning || card.pinyin || '',
    example: card.exampleHanzi
      ? `${card.exampleHanzi}${card.examplePinyin ? ` (${card.examplePinyin})` : ''}${card.exampleMeaning ? ` - ${card.exampleMeaning}` : ''}`
      : undefined,
  };
}

@Injectable()
export class FlashcardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, role: string, data: any) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: data.deckId },
    });
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
        },
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

  async findAllByDeckId(deckId: number, userId: number, role: string) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) {
      throw new NotFoundException('Deck not found');
    }
    if (!deck.isSystem && deck.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    const cards = await this.prisma.flashcard.findMany({
      where: {
        deck: {
          id: deckId,
        },
      },
      orderBy: { id: 'desc' },
    });
    return cards.map(mapFlashcardToFrontend);
  }

  async findOne(id: number, userId: number, role: string) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id },
      include: { deck: true },
    });
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    if (
      !card.deck.isSystem &&
      card.deck.userId !== userId &&
      role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập thẻ bài này!');
    }
    return mapFlashcardToFrontend(card);
  }

  async update(id: number, userId: number, role: string, data: any) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id },
      include: { deck: true },
    });
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    if (card.deck.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa thẻ bài này!');
    }

    const cleanData = { ...data };
    if (role !== 'ADMIN') {
      delete cleanData.deck;
      delete cleanData.deckId;
    }

    const updatedCard = await this.prisma.flashcard.update({
      where: { id },
      data: cleanData,
    });
    return mapFlashcardToFrontend(updatedCard);
  }

  async remove(id: number, userId: number, role: string) {
    const card = await this.prisma.flashcard.findUnique({
      where: { id },
      include: { deck: true },
    });
    if (!card) {
      throw new NotFoundException('Flashcard not found');
    }
    if (card.deck.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa thẻ bài này!');
    }
    await this.prisma.flashcard.delete({
      where: { id },
    });
    return { success: true, message: 'Flashcard deleted' };
  }

  async generateWithAI(
    userId: number,
    topic: string,
    count: number,
    hskLevel?: number,
    excludeWords?: string[],
  ) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!apiKey) throw new Error('DeepSeek API Key chưa được cấu hình!');

    const hskHint = hskLevel ? ` ở cấp độ HSK ${hskLevel}` : '';
    const excludeHint =
      excludeWords && excludeWords.length > 0
        ? `\n- TUYỆT ĐỐI KHÔNG ĐƯỢC chứa các từ vựng sau đây (tránh trùng lặp với thẻ đã có): ${excludeWords.join(', ')}`
        : '';

    const prompt = `Bạn là giáo viên tiếng Trung. Hãy tạo ${count} flashcard từ vựng tiếng Trung về chủ đề "${topic}"${hskHint}.${excludeHint}

TRẢ VỀ CHỈ MỘT MẢNG JSON THUẦN TÚY, không có markdown, không có giải thích, đúng format sau:
[
  {
    "hanzi": "你好",
    "pinyin": "nǐ hǎo",
    "meaning": "xin chào",
    "exampleHanzi": "你好，我叫小明。",
    "examplePinyin": "Nǐ hǎo, wǒ jiào Xiǎomíng.",
    "exampleMeaning": "Xin chào, tôi tên là Tiểu Minh."
  }
]

Yêu cầu:
- Chọn từ thông dụng, đúng chủ đề
- Pinyin phải có dấu thanh điệu đầy đủ
- Nghĩa tiếng Việt ngắn gọn, chính xác
- Câu ví dụ tự nhiên, ngắn (dưới 15 chữ)
- Trả về đúng ${count} từ`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a Chinese language teacher. Always respond with valid JSON arrays only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
    const resJson: any = await response.json();
    let content = resJson.choices[0].message.content.trim();

    // Strip markdown code blocks if present
    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    let cards: any[];
    try {
      cards = JSON.parse(content);
    } catch {
      throw new Error('AI trả về dữ liệu không hợp lệ. Vui lòng thử lại!');
    }

    if (!Array.isArray(cards))
      throw new Error('AI không trả về mảng flashcard hợp lệ!');
    return cards.slice(0, count);
  }
}
