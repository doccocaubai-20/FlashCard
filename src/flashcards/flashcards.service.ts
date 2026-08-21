import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

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

let cachedSentences: any[] | null = null;

function findExampleInCorpus(word: string): { exampleHanzi: string; examplePinyin: string; exampleMeaning: string } | null {
  if (!word) return null;

  if (!cachedSentences) {
    try {
      const paths = [
        path.join(process.cwd(), 'src', 'data', 'opusSentences.json'),
        path.join(process.cwd(), 'dist', 'data', 'opusSentences.json'),
        path.join(__dirname, '..', 'data', 'opusSentences.json'),
        path.join(__dirname, '..', '..', 'src', 'data', 'opusSentences.json'),
      ];
      
      let foundPath = '';
      for (const p of paths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }

      if (foundPath) {
        const fileContent = fs.readFileSync(foundPath, 'utf8');
        cachedSentences = JSON.parse(fileContent);
      } else {
        cachedSentences = [];
      }
    } catch (err) {
      console.error('Failed to load example corpus:', err);
      cachedSentences = [];
    }
  }

  if (!cachedSentences) return null;

  // Find a sentence that contains the target word (exact substring check)
  const match = cachedSentences.find(
    (item: any) => item.hanzi && item.hanzi.includes(word),
  );

  if (match) {
    return {
      exampleHanzi: match.hanzi,
      examplePinyin: match.pinyin || '',
      exampleMeaning: match.meaning || '',
    };
  }

  return null;
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

    // Auto-fill example sentence from local corpus if not provided (only for Chinese decks)
    if (deck.language === 'ZH' && !data.exampleHanzi) {
      const match = findExampleInCorpus(data.hanzi);
      if (match) {
        data.exampleHanzi = match.exampleHanzi;
        data.examplePinyin = match.examplePinyin;
        data.exampleMeaning = match.exampleMeaning;
      }
    }

    try {
      const card = await this.prisma.flashcard.create({
        data: {
          ...data,
          pinyin: data.pinyin || '',
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

      const word = item.hanzi || item.front || '';
      let exampleHanzi = item.exampleHanzi || null;
      let examplePinyin = item.examplePinyin || null;
      let exampleMeaning = item.exampleMeaning || null;

      if (deck.language === 'ZH' && !exampleHanzi) {
        const match = findExampleInCorpus(word);
        if (match) {
          exampleHanzi = match.exampleHanzi;
          examplePinyin = match.examplePinyin;
          exampleMeaning = match.exampleMeaning;
        }
      }

      return {
        deckId: deckId,
        hanzi: word,
        pinyin: pinyin,
        meaning: meaning,
        radicals: item.radicals || null,
        strokeData: item.strokeData || null,
        audioUrl: item.audioUrl || null,
        exampleHanzi: exampleHanzi,
        examplePinyin: examplePinyin,
        exampleMeaning: exampleMeaning,
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
      where: { deckId },
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
    language?: string,
  ) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!apiKey) throw new Error('DeepSeek API Key chưa được cấu hình!');

    const isEnglish = language === 'EN';
    let systemContent = 'You are a Chinese language teacher. Always respond with valid JSON arrays only.';
    let prompt = '';

    if (isEnglish) {
      systemContent = 'You are an English language teacher. Always respond with valid JSON arrays only.';
      const excludeHint =
        excludeWords && excludeWords.length > 0
          ? `\n- TUYỆT ĐỐI KHÔNG ĐƯỢC chứa các từ vựng sau đây (tránh trùng lặp với thẻ đã có): ${excludeWords.join(', ')}`
          : '';

      prompt = `Bạn là giáo viên tiếng Anh. Hãy tạo ${count} từ vựng tiếng Anh thông dụng về chủ đề "${topic}".${excludeHint}

TRẢ VỀ CHỈ MỘT MẢNG JSON THUẦN TÚY, không có markdown, không có giải thích, đúng format sau:
[
  {
    "hanzi": "apple",
    "pinyin": "/ˈæp.əl/",
    "meaning": "quả táo",
    "exampleHanzi": "She ate a red apple.",
    "examplePinyin": "",
    "exampleMeaning": "Cô ấy đã ăn một quả táo đỏ."
  }
]

Yêu cầu:
- Chọn từ thông dụng, đúng chủ đề
- "hanzi" chứa từ vựng tiếng Anh
- "pinyin" chứa phiên âm chuẩn IPA của từ đó (kẹp giữa hai dấu gạch chéo / /)
- "meaning" chứa dịch nghĩa tiếng Việt ngắn gọn, chính xác
- "exampleHanzi" chứa câu ví dụ tiếng Anh tự nhiên, ngắn (dưới 15 chữ)
- "examplePinyin" luôn để chuỗi rỗng ""
- "exampleMeaning" chứa dịch nghĩa tiếng Việt của câu ví dụ
- Trả về đúng ${count} từ`;
    } else {
      const hskHint = hskLevel ? ` ở cấp độ HSK ${hskLevel}` : '';
      const excludeHint =
        excludeWords && excludeWords.length > 0
          ? `\n- TUYỆT ĐỐI KHÔNG ĐƯỢC chứa các từ vựng sau đây (tránh trùng lặp với thẻ đã có): ${excludeWords.join(', ')}`
          : '';

      prompt = `Bạn là giáo viên tiếng Trung. Hãy tạo ${count} flashcard từ vựng tiếng Trung về chủ đề "${topic}"${hskHint}.${excludeHint}

TRẢ VỀ CHỈ MỘT MẢNG JSON THUẦN TÚY, không có markdown, không có giải thích, đúng format sau:
[
  {
    "hanzi": "你好",
    "pinyin": "nǐ hǎo",
    "meaning": "xin chào",
    "exampleHanzi": "你好，wǒ jiào Xiǎomíng.",
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
    }

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
            content: systemContent,
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

  async generateExampleWithAI(userId: number, cardId: number) {
    // 1. Find flashcard and deck
    const flashcard = await this.prisma.flashcard.findUnique({
      where: { id: cardId },
      include: { deck: true },
    });
    if (!flashcard) {
      throw new NotFoundException('Không tìm thấy thẻ bài!');
    }

    // 3. Call DeepSeek/OpenAI API
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key is not configured on the server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const isEnglish = flashcard.deck.language === 'EN';
    const prompt = isEnglish
      ? `You are a professional English teacher. Please create exactly 1 short, practical example sentence (under 15 words) using the English word/phrase: "${flashcard.hanzi}" (meaning: "${flashcard.meaning}").
        Return the result as a JSON object with the following fields:
        - "exampleHanzi": The English example sentence
        - "examplePinyin": ""
        - "exampleMeaning": The accurate and natural Vietnamese translation of the example sentence

        The output format must be raw JSON only, with no markdown code blocks or additional text.`
      : `Hãy đóng vai là một giáo viên tiếng Trung bản xứ chuyên nghiệp. Hãy tạo đúng 1 câu ví dụ minh họa giao tiếp thực tế cực kỳ ngắn gọn (dưới 15 chữ Hán) sử dụng từ/chữ Hán: "${flashcard.hanzi}" (nghĩa: "${flashcard.meaning}").
        Trả về kết quả dưới dạng JSON có các trường:
        - "exampleHanzi": Câu ví dụ bằng chữ Hán
        - "examplePinyin": Phiên âm Bính âm (Pinyin) có dấu của câu ví dụ đó
        - "exampleMeaning": Bản dịch nghĩa tiếng Việt chính xác và tự nhiên của câu ví dụ đó

        Định dạng trả về duy nhất là JSON thô, không bọc trong khối code markdown hay bất kỳ văn bản nào khác.`;

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
                  'You are a helpful language assistant. Respond ONLY with a raw JSON object.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 300,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      let content = resJson.choices[0].message.content.trim();

      // Strip markdown code blocks if present
      content = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      const result = JSON.parse(content);
      if (!result.exampleHanzi || !result.exampleMeaning) {
        throw new Error('AI returned incomplete data structure');
      }

      // 4. Update the Flashcard database entry
      const updatedCard = await this.prisma.flashcard.update({
        where: { id: cardId },
        data: {
          exampleHanzi: result.exampleHanzi,
          examplePinyin: result.examplePinyin || '',
          exampleMeaning: result.exampleMeaning,
        },
      });

      // 5. Upsert dictionary history to consume a daily AI limit token
      await this.prisma.dictionaryHistory.upsert({
        where: {
          userId_hanzi: {
            userId,
            hanzi: flashcard.hanzi,
          },
        },
        update: {
          aiGeneratedAt: new Date(),
        },
        create: {
          userId,
          hanzi: flashcard.hanzi,
          pinyin: flashcard.pinyin || '',
          vi: flashcard.meaning || '',
          aiGeneratedAt: new Date(),
        },
      });

      return mapFlashcardToFrontend(updatedCard);
    } catch (err) {
      console.error('Failed to generate AI example:', err);
      throw new HttpException(
        err.message || 'Lỗi tạo câu ví dụ bằng AI!',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
