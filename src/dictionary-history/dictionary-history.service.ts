import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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

  async explain(
    userId: number,
    body: { hanzi: string; traditional?: string; pinyin?: string; sv?: string; vi?: string; en?: string }
  ) {
    // 1. Check if we already have AI explanation cached
    const existing = await this.prisma.dictionaryHistory.findUnique({
      where: {
        userId_hanzi: {
          userId,
          hanzi: body.hanzi,
        },
      },
    });

    if (existing && existing.aiExplanation) {
      return { aiExplanation: existing.aiExplanation, cached: true };
    }

    // 2. Count AI explanations generated today (limit = 10)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const countToday = await this.prisma.dictionaryHistory.count({
      where: {
        userId,
        aiExplanation: { not: null },
        updatedAt: {
          gte: todayStart,
        },
      },
    });

    if (countToday >= 10) {
      throw new HttpException(
        'Bạn đã vượt quá giới hạn 10 lượt giải thích bằng AI mỗi ngày. Vui lòng quay lại vào ngày mai!',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Request DeepSeek API
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key is not configured on the server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const briefMeaning = body.en
        ? (Array.isArray(body.en) ? body.en[0] : body.en.split(/[;,]/)[0]).trim()
        : (body.vi || '').split('/')[0].trim();

      const prompt = `Hãy giải nghĩa ngắn gọn từ ghép: "${body.hanzi}" (Phồn thể: ${body.traditional || body.hanzi}, Bính âm: ${body.pinyin || ''}, Hán Việt: ${body.sv || ''}, Nghĩa định hướng: ${briefMeaning}).
Hãy tạo ra kết quả phân tích theo cấu trúc HTML chuẩn và bọc trong một thẻ div. Nội dung gồm:
1. Phân tích nguồn gốc và ý nghĩa cấu trúc từng chữ đơn cấu thành từ ghép này (yêu cầu cực kỳ ngắn gọn, tối đa 2 câu mỗi chữ đơn).
2. Đưa ra 3 câu ví dụ thực tế cực ngắn và thông dụng (mỗi câu ví dụ dưới 10 chữ Hán, gồm chữ Hán giản thể, Pinyin, và dịch nghĩa tiếng Việt).

Yêu cầu định dạng & tối ưu hóa:
- Trả về trực tiếp mã HTML bên trong <div>, không viết lời dẫn mở đầu hay kết luận. Không dùng thẻ markdown \`\`\`html.
- Sử dụng các thẻ HTML cơ bản như <p>, <strong>, <em>, <ul class="list-disc pl-5 space-y-1">, <li>...`;

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful Chinese language assistant. Respond as concisely as possible in structured HTML, avoiding any conversational filler.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      const content = resJson.choices[0].message.content;

      const cleanedContent = content
        .replace(/^```html\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      // 4. Cache output & update history
      await this.createOrUpdate(userId, {
        hanzi: body.hanzi,
        pinyin: body.pinyin,
        sv: body.sv,
        vi: body.vi,
        aiExplanation: cleanedContent,
      });

      return { aiExplanation: cleanedContent, cached: false };
    } catch (err) {
      console.error('Failed to generate AI explanation:', err);
      throw new HttpException(
        'Không thể tạo giải thích bằng AI: ' + err.message,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
