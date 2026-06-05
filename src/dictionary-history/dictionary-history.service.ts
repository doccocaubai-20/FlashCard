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

  async createOrUpdate(userId: number, dto: CreateHistoryDto & { aiGeneratedAt?: Date | null }) {
    const updateData: any = {
      pinyin: dto.pinyin,
      sv: dto.sv,
      vi: dto.vi,
    };
    if (dto.aiExplanation !== undefined) {
      updateData.aiExplanation = dto.aiExplanation;
    }
    if (dto.aiGeneratedAt !== undefined) {
      updateData.aiGeneratedAt = dto.aiGeneratedAt;
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
        aiGeneratedAt: dto.aiGeneratedAt || null,
      },
    });
  }

  async clearHistory(userId: number) {
    return this.prisma.dictionaryHistory.deleteMany({
      where: { userId },
    });
  }

  async getTodayCount(userId: number) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const count = await this.prisma.dictionaryHistory.count({
      where: {
        userId,
        aiGeneratedAt: {
          gte: todayStart,
        },
      },
    });

    return { count, limit: 10 };
  }

  async explain(
    userId: number,
    body: { hanzi: string; traditional?: string; pinyin?: string; sv?: string; vi?: string; en?: string; refresh?: boolean }
  ) {
    // 1. If not forcing a refresh, check if we already have AI explanation cached (either globally or locally)
    if (!body.refresh) {
      const existingShared = await this.prisma.dictionaryHistory.findFirst({
        where: {
          hanzi: body.hanzi,
          aiExplanation: {
            not: null,
          },
        },
        select: {
          aiExplanation: true,
        },
      });

      if (existingShared && existingShared.aiExplanation && existingShared.aiExplanation.trim()) {
        // Cache this shared explanation for the current user's history as well
        await this.createOrUpdate(userId, {
          hanzi: body.hanzi,
          pinyin: body.pinyin,
          sv: body.sv,
          vi: body.vi,
          aiExplanation: existingShared.aiExplanation,
        });

        const usage = await this.getTodayCount(userId);
        return { 
          aiExplanation: existingShared.aiExplanation, 
          cached: true,
          todayCount: usage.count,
          limit: usage.limit
        };
      }
    }

    // 2. Count AI explanations generated today (limit = 10)
    const usageInfo = await this.getTodayCount(userId);

    if (usageInfo.count >= usageInfo.limit) {
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

      const isSingleChar = body.hanzi.length === 1;
      const prompt = `Hãy đóng vai là một giáo viên tiếng Trung bản xứ chuyên nghiệp, am hiểu sâu sắc về từ nguyên học (etymology). Hãy phân tích ${isSingleChar ? 'chữ đơn' : 'từ ghép'} tiếng Trung: "${body.hanzi}" (Phồn thể: ${body.traditional || body.hanzi}, Bính âm: ${body.pinyin || ''}, Hán Việt: ${body.sv || ''}, Nghĩa định hướng: ${briefMeaning}).

Yêu cầu tạo kết quả phân tích bằng mã HTML chuẩn, bọc gọn hoàn toàn trong một thẻ <div>. Tuyệt đối KHÔNG viết lời dẫn mở đầu hay kết luận dông dài, và KHÔNG bọc trong khối code markdown \`\`\`html.

Cấu trúc yêu cầu như sau:

1. Thẻ bao ngoài: <div class="space-y-4">

2. Phần Phân tích cấu tạo chữ (Đặt tiêu đề: <h3 class="text-xs font-bold text-primary mb-2.5 uppercase tracking-wide">1. Phân tích chi tiết</h3>)
${isSingleChar ? `   - Hãy giải thích chi tiết cấu tạo chữ "${body.hanzi}": thuộc loại chữ nào trong Lục thư (tượng hình, chỉ sự, hội ý, hình thanh,...), gồm bộ thủ chính nào cấu thành và ý nghĩa nguyên bản của chữ đơn này. Giải thích sâu sắc nhưng cô đọng (khoảng 3-4 câu).` : `   - Hãy lần lượt duyệt qua từng chữ đơn cấu thành từ ghép "${body.hanzi}". Với mỗi chữ đơn, giải thích cấu tạo (thuộc loại chữ nào trong Lục thư, bộ thủ chính cấu thành) và nghĩa cốt lõi của chữ đó. Giải thích cô đọng (khoảng 2-3 câu mỗi chữ).`}
   - Định dạng mỗi chữ đơn phân tích nằm trong một khối:
     <div class="bg-surface-bone/30 dark:bg-black/10 p-3 rounded-md border border-hairline dark:border-divider-dark mb-2">
       <span class="font-bold text-ink dark:text-on-dark text-sm">[Chữ đơn]</span> - <span class="text-xs text-primary font-semibold">[Hán Việt / Bính âm]</span>: [Nội dung phân tích]
     </div>

${isSingleChar ? '' : `3. Phần Giải nghĩa tổng hợp (Đặt tiêu đề: <h3 class="text-xs font-bold text-primary mt-4 mb-2 uppercase tracking-wide">2. Giải nghĩa tổng hợp</h3>)
   - Giải thích cách kết hợp ý nghĩa của các chữ đơn để cấu thành nên nghĩa khái niệm hiện tại của từ ghép "${body.hanzi}". Viết cô đọng trong 2-3 câu.
`}

4. Phần Ví dụ thực tế (Đặt tiêu đề: <h3 class="text-xs font-bold text-primary mt-4 mb-2.5 uppercase tracking-wide">${isSingleChar ? '2' : '3'}. Ví dụ thực tế ngắn</h3>)
   - Đưa ra đúng 3 ví dụ giao tiếp thực tế cực kỳ ngắn gọn (mỗi câu dưới 12 chữ Hán) sử dụng từ/chữ "${body.hanzi}".
   - Định dạng mỗi ví dụ nằm trong một thẻ <li> với đúng cấu trúc:
     <li class="bg-surface-bone/50 dark:bg-black/20 p-3 rounded border border-hairline dark:border-divider-dark mb-2 list-none text-xs">
       <div class="font-bold text-sm text-ink dark:text-on-dark mb-1">[Câu tiếng Trung]</div>
       <div class="text-xs text-amber-500 font-mono font-medium mb-1">[Phiên âm Pinyin]</div>
       <div class="text-xs text-body dark:text-on-dark-mute italic">[Dịch nghĩa tiếng Việt tự nhiên, trôi chảy]</div>
     </li>`;

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
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(25000),
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
        aiGeneratedAt: new Date(),
      });

      const finalUsage = await this.getTodayCount(userId);
      return { 
        aiExplanation: cleanedContent, 
        cached: false,
        todayCount: finalUsage.count,
        limit: finalUsage.limit
      };
    } catch (err) {
      console.error('Failed to generate AI explanation:', err);
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận, vui lòng thử lại sau vài giây!'
          : 'Không thể tạo giải thích bằng AI: ' + err.message,
        isTimeout ? HttpStatus.REQUEST_TIMEOUT : HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
