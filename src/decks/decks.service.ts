import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, data: any, role = 'USER') {
    const isSystem = data.isSystem === true && role === 'ADMIN';
    return this.prisma.deck.create({
      data: {
        title: data.title,
        description: data.description,
        isSystem: isSystem,
        userId: isSystem ? null : userId,
      },
    });
  }

  async findAllUserDecks(userId: number) {
    const decks = await this.prisma.deck.findMany({
      where: {
        OR: [{ userId: userId }, { isSystem: true }],
      },
      include: {
        flashcards: {
          select: {
            id: true,
            progresses: {
              where: { userId },
              select: { repetitions: true },
            },
          },
        },
      },
    });
    return decks.map((deck) => {
      const cardCount = deck.flashcards.length;
      const studiedCount = deck.flashcards.filter(
        (card) =>
          card.progresses.length > 0 && card.progresses[0].repetitions > 0,
      ).length;
      return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        isSystem: deck.isSystem,
        createdAt: deck.createdAt,
        userId: deck.userId,
        cardCount,
        studiedCount,
      };
    });
  }
  async findOne(id: number) {
    return this.prisma.deck.findUnique({
      where: { id },
    });
  }

  async findFlashcardsByDeckId(deckId: number) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    const cards = await this.prisma.flashcard.findMany({
      where: { deckId },
      orderBy: { id: 'desc' },
    });
    return cards.map((card) => ({
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
    }));
  }

  async update(id: number, data: Prisma.DeckUpdateInput) {
    return this.prisma.deck.update({
      where: { id },
      data,
    });
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
      throw new ForbiddenException(
        'Không thể xóa bộ thẻ mặc định của hệ thống!',
      );
    }

    if (deck.userId !== currentUserId) {
      throw new ForbiddenException(
        'Bạn không có quyền thao tác trên bộ thẻ của người khác!',
      );
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
      throw new ForbiddenException(
        'Chỉ có thể xóa bộ thẻ mặc định của hệ thống!',
      );
    }

    return this.prisma.deck.delete({
      where: { id: deckId },
    });
  }

  async generateParagraph(deckId: number, words: string[], userId: number) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key chưa được cấu hình trên máy chủ.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const cards = await this.prisma.flashcard.findMany({
      where: { deckId },
      select: { hanzi: true, meaning: true, pinyin: true },
    });

    if (cards.length === 0) {
      throw new HttpException(
        'Bộ bài này chưa có thẻ từ vựng nào để tạo đoạn văn.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let selectedWords: { hanzi: string; meaning: string; pinyin: string }[] = [];
    if (words && words.length > 0) {
      // Lọc lấy các từ trong bộ bài mà người dùng chọn
      selectedWords = cards.filter(c => words.includes(c.hanzi));
      if (selectedWords.length === 0) {
        // Fallback: Nếu không khớp từ nào thì lấy 20 từ đầu tiên
        selectedWords = cards.slice(0, 20);
      }
    } else {
      // Mặc định lấy tối đa 20 từ đầu tiên
      selectedWords = cards.slice(0, 20);
    }
    const wordsListStr = selectedWords
      .map(w => `- Từ: ${w.hanzi} (Phiên âm: ${w.pinyin}, Nghĩa: ${w.meaning})`)
      .join('\n');

    const prompt = `Bạn là một giáo viên tiếng Trung. Hãy viết một đoạn văn tiếng Trung khoảng 200 chữ, tự nhiên và mạch lạc, sử dụng các từ vựng sau đây:
${wordsListStr}

Bạn PHẢI trả về duy nhất một đối tượng JSON thuần túy (không có markdown code block, không có giải thích ngoài JSON) theo cấu trúc chính xác như sau:
{
  "paragraphHanzi": "...",
  "paragraphPinyin": "...",
  "paragraphMeaning": "...",
  "wordUsage": [
    {
      "word": "...",
      "pinyin": "...",
      "meaning": "...",
      "explanation": "..."
    }
  ]
}

Trong đó:
- "paragraphHanzi": Đoạn văn bằng chữ Hán giản thể.
- "paragraphPinyin": Phiên âm Pinyin đầy đủ, có dấu thanh điệu của cả đoạn văn.
- "paragraphMeaning": Bản dịch tiếng Việt trôi chảy của đoạn văn.
- "wordUsage": Danh sách các từ đầu vào đã được dùng, kèm pinyin, nghĩa tiếng Việt và "explanation" là lời giải thích ngắn gọn bằng tiếng Việt về cách dùng từ đó trong ngữ cảnh của đoạn văn.`;

    try {
      const response = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
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
                  'You are a professional Chinese teacher. Always respond with a single valid JSON object only. No markdown formatting, no backticks, no wrap.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 20000,
          }),
          signal: AbortSignal.timeout(60000), // 60s timeout for longer context
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      let content = resJson.choices[0].message.content.trim();

      // Dọn dẹp markdown code blocks nếu AI trả về kèm ```json
      if (content.startsWith('```')) {
        content = content
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/, '')
          .trim();
      }

      const result = JSON.parse(content);
      return result;
    } catch (err) {
      console.error('Lỗi khi gọi DeepSeek trong DecksService:', err);
      const error = err as any;
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận phản hồi chậm, vui lòng thử lại sau!'
          : 'Lỗi khi kết nối với AI để tạo đoạn văn: ' + (error.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async saveParagraph(
    deckId: number,
    userId: number,
    data: { hanzi: string; pinyin: string; meaning: string; words: string[]; wordUsage: any },
  ) {
    return this.prisma.savedParagraph.create({
      data: {
        deckId,
        userId,
        hanzi: data.hanzi,
        pinyin: data.pinyin,
        meaning: data.meaning,
        words: data.words,
        wordUsage: data.wordUsage,
      },
    });
  }

  async getSavedParagraphs(deckId: number, userId: number) {
    return this.prisma.savedParagraph.findMany({
      where: {
        deckId,
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deleteSavedParagraph(paragraphId: number, userId: number) {
    const paragraph = await this.prisma.savedParagraph.findUnique({
      where: { id: paragraphId },
    });

    if (!paragraph) {
      throw new NotFoundException('Không tìm thấy đoạn văn đã lưu!');
    }

    if (paragraph.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa đoạn văn này!');
    }

    return this.prisma.savedParagraph.delete({
      where: { id: paragraphId },
    });
  }
}

