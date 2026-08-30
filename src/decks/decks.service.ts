import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
function removeDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (char) => (char === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .trim();
}

@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, data: any, role = 'USER') {
    const isSystem = data.isSystem === true && role === 'ADMIN';
    return this.prisma.deck.create({
      data: {
        title: data.title,
        description: data.description,
        isSystem: isSystem,
        userId: isSystem ? null : userId,
        language: data.language || 'ZH',
      },
    });
  }

  async findAllUserDecks(userId: number) {
    const decks = await this.prisma.deck.findMany({
      where: {
        OR: [{ userId: userId }, { isSystem: true }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        isSystem: true,
        createdAt: true,
        userId: true,
        language: true,
        _count: {
          select: {
            flashcards: true,
          },
        },
      },
    });

    const deckPromises = decks.map(async (deck) => {
      const cardCount = deck._count.flashcards;
      
      // Fast index-optimized COUNT query for studied cards
      const studiedCount = await this.prisma.userProgress.count({
        where: {
          userId: userId,
          repetitions: { gt: 0 },
          flashcard: {
            deckId: deck.id,
          },
        },
      });

      return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        isSystem: deck.isSystem,
        createdAt: deck.createdAt,
        userId: deck.userId,
        cardCount,
        studiedCount,
        language: deck.language || 'ZH',
      };
    });

    const result = await Promise.all(deckPromises);

    return result.sort((a, b) => {
      const langA = a.language || 'ZH';
      const langB = b.language || 'ZH';
      if (langA !== langB) {
        return langA === 'ZH' ? -1 : 1;
      }

      if (a.isSystem !== b.isSystem) {
        return a.isSystem ? -1 : 1;
      }

      if (a.isSystem) {
        // HSK Level sorting
        const matchHskA = a.title.match(/HSK\s*(\d+|7-9)/i);
        const matchHskB = b.title.match(/HSK\s*(\d+|7-9)/i);
        if (matchHskA && matchHskB) {
          const valA = matchHskA[1] === '7-9' ? 7 : parseInt(matchHskA[1], 10);
          const valB = matchHskB[1] === '7-9' ? 7 : parseInt(matchHskB[1], 10);
          return valA - valB;
        }

        // TOEIC Target Score sorting
        const matchToeicA = a.title.match(/TOEIC\s*(\d+)-(\d+)/i);
        const matchToeicB = b.title.match(/TOEIC\s*(\d+)-(\d+)/i);
        if (matchToeicA && matchToeicB) {
          const valA = parseInt(matchToeicA[1], 10);
          const valB = parseInt(matchToeicB[1], 10);
          return valA - valB;
        }
      }

      // Default alphabetical sorting
      return a.title.localeCompare(b.title, 'vi');
    });
  }
  async findOne(id: number) {
    const deck = await this.prisma.deck.findUnique({
      where: { id },
    });
    if (!deck) return null;

    // Fetch unique topicIds present in this deck
    const flashcards = await this.prisma.flashcard.findMany({
      where: { deckId: id },
      select: { topicId: true },
      distinct: ['topicId'],
    });
    const topicIds = flashcards
      .map((f) => f.topicId)
      .filter((tid) => tid !== null && tid !== undefined)
      .sort((a, b) => a - b);

    // Count total cards in the deck
    const cardsCount = await this.prisma.flashcard.count({
      where: { deckId: id },
    });

    // Count cards per topic in the deck
    const topicGroup = await this.prisma.flashcard.groupBy({
      by: ['topicId'],
      where: { deckId: id },
      _count: {
        id: true,
      },
    });

    const topicCounts = {};
    topicGroup.forEach((g) => {
      if (g.topicId !== null && g.topicId !== undefined) {
        topicCounts[g.topicId] = g._count.id;
      }
    });

    return {
      ...deck,
      topicIds,
      cardsCount,
      topicCounts,
    };
  }

  async findFlashcardsByDeckId(
    deckId: number,
    limit?: number,
    offset?: number,
    topicId?: number,
    search?: string,
  ) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }

    const whereClause: any = { deckId };
    if (topicId !== undefined) {
      whereClause.topicId = topicId;
    }

    let cards: any[] = [];
    let totalCount = 0;
    const hasSearch = search && search.trim() !== '';

    if (hasSearch) {
      // Fetch all matching cards to filter in memory for diacritic-insensitive search
      const allCards = await this.prisma.flashcard.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
      });

      const q = removeDiacritics(search.trim());
      const filteredCards = allCards.filter((card) => {
        const hanzi = removeDiacritics(card.hanzi || '');
        const pinyin = removeDiacritics(card.pinyin || '');
        const meaning = removeDiacritics(card.meaning || '');
        return hanzi.includes(q) || pinyin.includes(q) || meaning.includes(q);
      });

      totalCount = filteredCards.length;
      const start = offset !== undefined ? offset : 0;
      const end = limit !== undefined ? start + limit : filteredCards.length;
      cards = filteredCards.slice(start, end);
    } else {
      // Normal database pagination path
      totalCount = await this.prisma.flashcard.count({
        where: whereClause,
      });

      cards = await this.prisma.flashcard.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
        take: limit,
        skip: offset,
      });
    }

    const mappedCards = cards.map((card) => ({
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

    if (limit !== undefined) {
      return { cards: mappedCards, totalCount };
    }
    return mappedCards;
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

    let selectedWords: { hanzi: string; meaning: string; pinyin: string }[] =
      [];
    if (words && words.length > 0) {
      // Lọc lấy các từ trong bộ bài mà người dùng chọn
      selectedWords = cards.filter((c) => words.includes(c.hanzi));
      if (selectedWords.length === 0) {
        // Fallback: Nếu không khớp từ nào thì lấy tất cả các từ
        selectedWords = cards;
      }
    } else {
      // Mặc định lấy tất cả từ
      selectedWords = cards;
    }
    const wordsListStr = selectedWords
      .map(
        (w) => `- Từ: ${w.hanzi} (Phiên âm: ${w.pinyin}, Nghĩa: ${w.meaning})`,
      )
      .join('\n');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nativeLanguage: true },
    });
    const lang = user?.nativeLanguage || 'vi';
    const langNames: Record<string, string> = {
      vi: 'Vietnamese',
      en: 'English',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      ru: 'Russian',
    };
    const targetLangName = langNames[lang] || 'Vietnamese';

    const prompt = `Bạn là một giáo viên tiếng Trung. Hãy viết một đoạn văn tiếng Trung khoảng 200 chữ, tự nhiên và mạch lạc, sử dụng các từ vựng sau đây:
${wordsListStr}

CRITICAL INSTRUCTION: The user's native language is ${targetLangName}. You MUST provide the paragraphMeaning and all wordUsage explanations/meanings in ${targetLangName}.

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
- "paragraphMeaning": Bản dịch trôi chảy bằng ${targetLangName} của đoạn văn.
- "wordUsage": Danh sách các từ đầu vào đã được dùng, kèm pinyin, nghĩa bằng ${targetLangName} và "explanation" là lời giải thích ngắn gọn bằng ${targetLangName} về cách dùng từ đó trong ngữ cảnh của đoạn văn.`;

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
      const isTimeout =
        error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận phản hồi chậm, vui lòng thử lại sau!'
          : 'Lỗi khi kết nối với AI để tạo đoạn văn: ' +
              (error.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async saveParagraph(
    deckId: number,
    userId: number,
    data: {
      hanzi: string;
      pinyin: string;
      meaning: string;
      words: string[];
      wordUsage: any;
    },
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

  async generateDeckFromText(
    userId: number,
    text: string,
    deckTitle: string,
    _role: string,
  ) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key chưa được cấu hình trên máy chủ.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!text || text.trim().length === 0) {
      throw new HttpException(
        'Văn bản đầu vào không được để trống.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nativeLanguage: true },
    });
    const lang = user?.nativeLanguage || 'vi';
    const langNames: Record<string, string> = {
      vi: 'Vietnamese',
      en: 'English',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      ru: 'Russian',
    };
    const targetLangName = langNames[lang] || 'Vietnamese';

    const prompt = `Bạn là một chuyên gia ngôn ngữ tiếng Trung và chuyên gia khôi phục dữ liệu OCR.
Đoạn văn dưới đây có thể là kết quả quét ảnh sách giáo khoa (OCR) chứa nhiều lỗi chính tả, sai ký hiệu bính âm hoặc lẫn lộn các từ tiếng Việt bị biến dạng do góc chụp cong hoặc nhiễu.
Hãy phân tích kỹ ngữ cảnh, sửa toàn bộ lỗi chính tả, nhận diện và khôi phục lại toàn bộ các từ vựng tiếng Trung chuẩn (bao gồm cả từ đơn và từ ghép) xuất hiện trong tài liệu đó kèm phiên âm bính âm đúng, giải nghĩa chính xác bằng ${targetLangName} và đặt câu ví dụ tương ứng.

Văn bản cần phân tích:
"${text}"

CRITICAL INSTRUCTION: The user's native language is ${targetLangName}. You MUST provide the meaning and exampleMeaning in ${targetLangName}.

Bạn PHẢI trả về duy nhất một đối tượng JSON thuần túy (không có markdown code block, không có giải thích ngoài JSON) theo cấu trúc chính xác như sau:
{
  "words": [
    {
      "hanzi": "...",
      "pinyin": "...",
      "meaning": "...",
      "exampleHanzi": "...",
      "examplePinyin": "...",
      "exampleMeaning": "..."
    }
  ]
}

Trong đó:
- "hanzi": Từ vựng tiếng Trung chữ Hán giản thể được trích xuất.
- "pinyin": Phiên âm bính âm đầy đủ kèm thanh điệu của từ vựng đó.
- "meaning": Giải nghĩa ngắn gọn, chính xác của từ vựng đó bằng ${targetLangName}.
- "exampleHanzi": Một câu ví dụ tiếng Trung cực kỳ ngắn gọn và dễ hiểu chứa từ vựng đó.
- "examplePinyin": Phiên âm bính âm đầy đủ kèm thanh điệu của câu ví dụ.
- "exampleMeaning": Bản dịch nghĩa trôi chảy bằng ${targetLangName} của câu ví dụ.`;

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
            temperature: 0.3,
            max_tokens: 12000,
          }),
          signal: AbortSignal.timeout(60000),
        },
      );

      if (!response.ok) {
        throw new HttpException(
          `DeepSeek API Error: Lỗi kết nối máy chủ dịch vụ AI.`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const resBody = await response.json();
      let contentStr = resBody?.choices?.[0]?.message?.content;
      if (!contentStr) {
        throw new HttpException(
          'Không nhận được kết quả phân tích từ AI.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      contentStr = contentStr.replace(/```json/g, '').replace(/```/g, '').trim();

      const parsed = JSON.parse(contentStr);
      if (!parsed || !Array.isArray(parsed.words)) {
        throw new HttpException(
          'Định dạng phản hồi từ AI không hợp lệ.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const deck = await this.prisma.deck.create({
        data: {
          title: deckTitle,
          description: `Được trích xuất tự động từ văn bản bởi AI.`,
          isSystem: false,
          userId: userId,
        },
      });

      const cardsData = parsed.words.map((item: any) => ({
        deckId: deck.id,
        hanzi: item.hanzi || '',
        pinyin: item.pinyin || '',
        meaning: item.meaning || '',
        exampleHanzi: item.exampleHanzi || null,
        examplePinyin: item.examplePinyin || null,
        exampleMeaning: item.exampleMeaning || null,
      }));

      await this.prisma.flashcard.createMany({
        data: cardsData,
        skipDuplicates: true,
      });

      return {
        success: true,
        deckId: deck.id,
        title: deck.title,
        cardsCount: cardsData.length,
      };
    } catch (error) {
      console.error('Failed to generate deck from text:', error);
      if (error instanceof SyntaxError) {
        throw new HttpException(
          'AI phản hồi dữ liệu không chuẩn JSON. Vui lòng thử lại.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw error;
    }
  }
}

