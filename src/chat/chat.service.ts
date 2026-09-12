import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatsService } from '../stats/stats.service';

// 5 Chế độ Gia sư Chuyên biệt
export const PERSONA_CONFIGS = {
  general: {
    name: 'ChongZi Tiên Sinh',
    role: 'Gia sư toàn năng',
    systemPrompt: (userLang: string) => `Bạn là ChongZi Tiên Sinh (ChongZi Master), một gia sư tiếng Trung thông thái, kiên nhẫn và tận tụy.
Ngôn ngữ mẹ đẻ của học viên là: ${userLang}. BẠN PHẢI cung cấp mọi giải thích, phân tích và hướng dẫn bằng ${userLang}.
Nhiệm vụ của bạn:
1. Giải đáp thắc mắc về ngữ pháp, từ vựng HSK, cách dùng câu, thanh điệu pinyin.
2. Với mọi từ hoặc câu tiếng Trung bạn đưa ra, LUÔN LUÔN kèm theo Pinyin (có dấu thanh điệu chuẩn) và bản dịch nghĩa tiếng ${userLang}.
3. Nếu học viên hỏi về các tính năng của website ChongZi, hãy hướng dẫn họ:
   - Dashboard: Xem từ vựng hôm nay, streak, heatmap học tập.
   - Bộ bài (Decks): Học flashcard với thuật toán FSRS-4.5.
   - Nông trại Tri Thức (/farm): Trồng cây từ vựng, tưới nước, thu hoạch Xu thưởng.
   - Luyện thi HSK (/hsk-exams): 77 đề thi chuẩn HSK 1-6 kèm audio.
   - Luyện đọc HSK (/reading): Bài đọc phân cấp theo chủ đề có trắc nghiệm.
   - Đấu trường Game (/game-arcade): Lật thẻ, Hứng từ rơi, Xếp câu, Nghe chép.
   - Tra cứu (/dictionary): Từ điển đa năng, 214 Bộ thủ, Bảng âm Pinyin, Ngữ pháp.
Hãy trả lời thân thiện, mạch lạc, dùng Markdown đẹp mắt (bảng biểu, danh sách, in đậm) để người học tiếp thu tốt nhất.`
  },
  roleplay: {
    name: 'Bạn Luyện Khẩu Ngữ',
    role: 'Đóng vai giao tiếp',
    systemPrompt: (userLang: string) => `Bạn là Bạn Luyện Khẩu Ngữ tiếng Trung của học viên.
Ngôn ngữ mẹ đẻ của học viên là: ${userLang}.
Nhiệm vụ của bạn:
1. Đóng vai người bản xứ (Bắc Kinh, Thượng Hải, v.v.) trò chuyện đời thường, tự nhiên, sinh động.
2. Mỗi câu trả lời của bạn nên ngắn gọn (2-4 câu), kèm Pinyin và bản dịch tiếng ${userLang} ở dòng dưới.
3. QUY TẮC QUAN TRỌNG: Ở cuối mỗi tin nhắn, bạn LUÔN LUÔN phải đặt 1 câu hỏi gợi mở hoặc câu đối đáp bằng tiếng Trung để thúc đẩy học viên tiếp tục trò chuyện và phản xạ.
4. Nếu học viên nói câu chưa chuẩn, hãy nhẹ nhàng gợi ý cách nói tự nhiên hơn của người bản xứ.`
  },
  grammar: {
    name: 'Bác Sĩ Ngữ Pháp',
    role: 'Chuyên gia sửa lỗi & phân tích',
    systemPrompt: (userLang: string) => `Bạn là Bác Sĩ Ngữ Pháp (Grammar Doctor) tiếng Trung của ChongZi.
Ngôn ngữ mẹ đẻ của học viên là: ${userLang}. Mọi giải thích đều bằng ${userLang}.
Nhiệm vụ của bạn:
1. Khi học viên gửi một câu tiếng Trung hoặc nhờ sửa bài:
   - Hãy đánh giá xem câu đó Đúng hay Có lỗi sai.
   - Trình bày dạng bảng Markdown rõ ràng:
     | Yếu tố | Nội dung |
     | :--- | :--- |
     | **Câu gốc của bạn** | [Câu học viên viết] |
     | **Đánh giá** | [Đạt / Cần sửa] |
     | **Câu sửa chuẩn** | [Câu đúng tự nhiên, kèm Pinyin] |
     | **Nghĩa tiếng ${userLang}** | [Bản dịch chuẩn] |
   - Giải thích cặn kẽ TẠI SAO sai (nguyên tắc trật tự từ, hư từ, ngữ pháp 把/被/比, bổ ngữ kết quả/phương hướng...).
   - Đưa ra 2-3 câu ví dụ tương tự để học viên khắc sâu ghi nhớ.`
  },
  hsk: {
    name: 'Chiến Lược Gia HSK',
    role: 'Huấn luyện viên luyện thi',
    systemPrompt: (userLang: string) => `Bạn là Huấn Luyện Viên Luyện Thi HSK 1 - HSK 6 của ChongZi.
Ngôn ngữ mẹ đẻ của học viên là: ${userLang}. Mọi giải thích đều bằng ${userLang}.
Nhiệm vụ của bạn:
1. Tập trung vào thực chiến kỳ thi HSK mới (HSK 3.0 và HSK 2.0).
2. Phân tích các bẫy thường gặp trong phần Nghe (听力), Đọc hiểu (阅读), và Viết (书写).
3. So sánh các cặp từ gần nghĩa hay gây nhầm lẫn trong đề thi HSK.
4. Hướng dẫn cấu trúc viết câu, liên từ nối và đoạn văn ngắn để đạt điểm cao.
5. Cung cấp câu hỏi mô phỏng đề thi khi học viên yêu cầu ôn tập theo cấp độ.`
  },
  etymology: {
    name: 'Chiết Tự & Điển Tích',
    role: 'Khám phá văn hóa & chữ Hán',
    systemPrompt: (userLang: string) => `Bạn là Bậc Thầy Chiết Tự & Điển Tích Thành Ngữ của ChongZi.
Ngôn ngữ mẹ đẻ của học viên là: ${userLang}. Mọi giải thích đều bằng ${userLang}.
Nhiệm vụ của bạn:
1. Phân tích nguồn gốc chữ Hán theo phương pháp Lục Thư (tượng hình, chỉ sự, hội ý, hình thanh...).
2. Bóc tách chữ Hán thành các Bộ thủ cấu thành và giải thích logic tư duy của người xưa để người học nhớ lâu.
3. Kể lại nguồn gốc, điển tích lịch sử sâu sắc đằng sau các câu thành ngữ 4 chữ (Thành ngữ Hán ngữ - 成语).
4. Giúp học viên cảm nhận được nét đẹp văn hóa và nghệ thuật tạo chữ Trung Hoa.`
  }
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 1. TOKEN QUOTA & USAGE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Đảm bảo UserStats tồn tại và tự động reset hạn mức token về 0 nếu bước sang ngày mới
   */
  async checkAndResetDailyQuota(userId: number) {
    let stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: {
          userId,
          dailyAiTokensUsed: 0,
          dailyAiTokensLimit: 50000,
          lastAiTokenReset: new Date(),
        },
      });
      return stats;
    }

    const now = new Date();
    const lastReset = new Date(stats.lastAiTokenReset || stats.lastStudyDate || now);

    // Kiểm tra xem đã qua 00:00 ngày mới chưa (so sánh ngày, tháng, năm)
    const isNewDay =
      now.getFullYear() !== lastReset.getFullYear() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getDate() !== lastReset.getDate();

    if (isNewDay) {
      stats = await this.prisma.userStats.update({
        where: { userId },
        data: {
          dailyAiTokensUsed: 0,
          lastAiTokenReset: now,
          // Đảm bảo limit tối thiểu là 50.000 mỗi ngày
          dailyAiTokensLimit: Math.max(50000, stats.dailyAiTokensLimit),
        },
      });
    }

    return stats;
  }

  /**
   * Lấy thông tin hạn mức Token hiện tại của tài khoản
   */
  async getQuotaStatus(userId: number) {
    const stats = await this.checkAndResetDailyQuota(userId);
    const used = stats.dailyAiTokensUsed || 0;
    const limit = stats.dailyAiTokensLimit || 50000;
    const remaining = Math.max(0, limit - used);

    // Tính thời gian reset tiếp theo (00:00 ngày mai)
    const nextReset = new Date();
    nextReset.setDate(nextReset.getDate() + 1);
    nextReset.setHours(0, 0, 0, 0);

    return {
      used,
      limit,
      remaining,
      lifetime: stats.lifetimeAiTokens || 0,
      coins: stats.coins || 0,
      percentUsed: Math.min(100, Math.round((used / limit) * 100)),
      resetAt: nextReset.toISOString(),
    };
  }

  /**
   * Kiểm tra hạn mức, chặn yêu cầu nếu tài khoản đã hết token
   */
  async enforceTokenQuota(userId: number) {
    const stats = await this.checkAndResetDailyQuota(userId);
    const used = stats.dailyAiTokensUsed || 0;
    const limit = stats.dailyAiTokensLimit || 50000;

    if (used >= limit) {
      throw new HttpException(
        `Bạn đã sử dụng hết hạn mức ${limit.toLocaleString()} tokens AI hôm nay. Hạn mức sẽ tự động phục hồi vào 00:00 ngày mai, hoặc bạn có thể đổi 50 Xu thưởng để nạp thêm +15.000 tokens!`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return stats;
  }

  /**
   * Ghi nhận số tokens tiêu thụ thực tế sau khi nhận phản hồi từ DeepSeek
   */
  async recordTokenUsage(userId: number, totalTokens: number) {
    if (!totalTokens || totalTokens <= 0) return;

    try {
      await this.prisma.userStats.update({
        where: { userId },
        data: {
          dailyAiTokensUsed: { increment: totalTokens },
          lifetimeAiTokens: { increment: totalTokens },
        },
      });
    } catch (err) {
      console.error('Failed to record token usage in UserStats:', err);
    }
  }

  /**
   * Đổi Xu thưởng (50 Xu) lấy thêm +15.000 tokens
   */
  async refillTokensWithCoins(userId: number, coinCost = 50, tokenBonus = 15000) {
    const stats = await this.checkAndResetDailyQuota(userId);

    if (stats.coins < coinCost) {
      throw new HttpException(
        `Bạn cần ít nhất ${coinCost} Xu để nạp thêm tokens (Hiện có: ${stats.coins} Xu). Hãy chăm sóc Nông trại Tri Thức hoặc ôn bài để nhận thêm Xu nhé!`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.prisma.userStats.update({
      where: { userId },
      data: {
        coins: { decrement: coinCost },
        dailyAiTokensLimit: { increment: tokenBonus },
      },
    });

    return {
      message: `Đổi thành công! Nhận thêm +${tokenBonus.toLocaleString()} tokens học tập.`,
      coins: updated.coins,
      newLimit: updated.dailyAiTokensLimit,
      remaining: Math.max(0, updated.dailyAiTokensLimit - updated.dailyAiTokensUsed),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. CHAT SESSIONS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Lấy danh sách toàn bộ các phiên trò chuyện của người dùng
   */
  async getSessions(userId: number) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      include: {
        _count: {
          select: { messages: true },
        },
        deck: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Tạo phiên trò chuyện mới
   */
  async createSession(
    userId: number,
    data?: { title?: string; persona?: string; deckId?: number },
  ) {
    const persona = data?.persona || 'general';
    const personaName = PERSONA_CONFIGS[persona]?.name || 'ChongZi AI';
    const defaultTitle = data?.title || `Học cùng ${personaName}`;

    return this.prisma.chatSession.create({
      data: {
        userId,
        title: defaultTitle,
        persona,
        deckId: data?.deckId || null,
      },
      include: {
        deck: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Cập nhật thông tin phiên (đổi tên, ghim, đổi persona)
   */
  async updateSession(
    userId: number,
    sessionId: string,
    data: { title?: string; pinned?: boolean; persona?: string; deckId?: number },
  ) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new HttpException('Không tìm thấy phiên trò chuyện.', HttpStatus.NOT_FOUND);
    }

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
        ...(data.persona !== undefined ? { persona: data.persona } : {}),
        ...(data.deckId !== undefined ? { deckId: data.deckId } : {}),
      },
      include: {
        deck: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Xóa một phiên trò chuyện (tự động xóa toàn bộ tin nhắn thuộc phiên)
   */
  async deleteSession(userId: number, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new HttpException('Không tìm thấy phiên trò chuyện.', HttpStatus.NOT_FOUND);
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { message: 'Đã xóa phiên trò chuyện thành công.' };
  }

  /**
   * Lấy toàn bộ tin nhắn của một phiên cụ thể
   */
  async getSessionMessages(userId: number, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new HttpException('Không tìm thấy phiên trò chuyện.', HttpStatus.NOT_FOUND);
    }

    return this.prisma.chatMessage.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Tương thích ngược: Lấy tin nhắn không gắn session hoặc phiên mới nhất
   */
  async getHistory(userId: number) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  /**
   * Tương thích ngược: Xóa toàn bộ lịch sử
   */
  async clearHistory(userId: number) {
    await this.prisma.chatMessage.deleteMany({
      where: { userId },
    });
    await this.prisma.chatSession.deleteMany({
      where: { userId },
    });
    return { message: 'Đã xóa toàn bộ lịch sử trò chuyện.' };
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. CORE SEND MESSAGE ENGINE WITH DEEPSEEK & TOKEN ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Gửi tin nhắn đến AI, nạp Persona & Bộ thẻ, kiểm soát token quota và lưu DB
   */
  async sendMessage(
    userId: number,
    content: string,
    options?: {
      sessionId?: string;
      persona?: string;
      deckId?: number;
    },
  ) {
    if (!content || !content.trim()) {
      throw new HttpException(
        'Nội dung tin nhắn không được để trống.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1. Kiểm tra hạn mức Token hàng ngày
    await this.enforceTokenQuota(userId);

    // 2. Tìm hoặc tự động tạo phiên trò chuyện (Session)
    let session: any = null;
    if (options?.sessionId) {
      session = await this.prisma.chatSession.findFirst({
        where: { id: options.sessionId, userId },
      });
    }

    if (!session) {
      // Tìm phiên gần nhất hoặc tạo mới
      const latestSession = await this.prisma.chatSession.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });

      if (latestSession && !options?.sessionId) {
        session = latestSession;
      } else {
        session = await this.createSession(userId, {
          persona: options?.persona || 'general',
          deckId: options?.deckId,
        });
      }
    }

    const currentPersona = options?.persona || session.persona || 'general';
    const currentDeckId = options?.deckId !== undefined ? options.deckId : session.deckId;

    // 3. Lấy lịch sử 20 tin nhắn gần nhất của phiên này để làm context
    const history = await this.prisma.chatMessage.findMany({
      where: {
        userId,
        sessionId: session.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const sortedHistory = history.reverse();

    // 4. Lấy ngôn ngữ người dùng & cấu hình System Prompt theo Persona
    const userObj = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nativeLanguage: true },
    });
    const userLang = userObj?.nativeLanguage === 'en' ? 'English' : 'Tiếng Việt';

    const personaConfig = PERSONA_CONFIGS[currentPersona] || PERSONA_CONFIGS.general;
    let systemPrompt = personaConfig.systemPrompt(userLang);

    // 5. Nạp ngữ cảnh từ Bộ thẻ (Deck) nếu có chỉ định hoặc session liên kết
    if (currentDeckId) {
      try {
        const deck = await this.prisma.deck.findUnique({
          where: { id: currentDeckId },
          include: {
            flashcards: {
              take: 50,
              select: {
                hanzi: true,
                pinyin: true,
                meaning: true,
                exampleHanzi: true,
                examplePinyin: true,
                exampleMeaning: true,
              },
            },
          },
        });

        if (deck && deck.flashcards.length > 0) {
          const cardList = deck.flashcards
            .map(
              (c) =>
                `${c.hanzi} (${c.pinyin}: ${c.meaning})${
                  c.exampleHanzi ? ` [Ví dụ: ${c.exampleHanzi} - ${c.exampleMeaning}]` : ''
                }`,
            )
            .join(', ');

          systemPrompt += `\n\n[BỘ THẺ TỪ VỰNG HỌC VIÊN ĐANG HỌC]: "${deck.title}" (${deck.flashcards.length} từ):\n${cardList}\n\nHọc viên muốn bạn ưu tiên sử dụng các từ vựng này trong câu trả lời, hội thoại hoặc ví dụ đặt câu để giúp họ ôn tập.`;
        }
      } catch (err) {
        console.warn('Failed to load deck context for chat:', err);
      }
    }

    // 6. Xây dựng tin nhắn gửi đến DeepSeek
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...sortedHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: content.trim() },
    ];

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'Chưa cấu hình DEEPSEEK_API_KEY trên hệ thống máy chủ.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 7. Gọi DeepSeek API với cơ chế Retry & Timeout
    let response: any;
    let retries = 3;
    let lastError: any = null;

    while (retries > 0) {
      try {
        response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            temperature: currentPersona === 'roleplay' ? 0.7 : 0.5,
            max_tokens: 2000,
          }),
          signal: AbortSignal.timeout(28000),
        });

        if (response.ok) {
          break;
        }

        if (response.status === 429 || response.status >= 500) {
          retries--;
          if (retries > 0) {
            await new Promise((res) => setTimeout(res, 1500));
            continue;
          }
        }

        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      } catch (err: any) {
        lastError = err;
        const isNetworkOrTimeout =
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError' ||
          err?.code === 'ECONNRESET';
        if (isNetworkOrTimeout && retries > 1) {
          retries--;
          await new Promise((res) => setTimeout(res, 1000));
          continue;
        }
        throw err;
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Không thể kết nối đến máy chủ AI.');
    }

    const resJson: any = await response.json();
    const aiReply =
      resJson?.choices?.[0]?.message?.content ||
      'Xin lỗi, tôi chưa thể hoàn thành câu trả lời lúc này.';

    // Trích xuất số token tiêu thụ thực tế
    const tokensUsed = resJson?.usage?.total_tokens || 350;

    // 8. Lưu tin nhắn User vào DB
    await this.prisma.chatMessage.create({
      data: {
        userId,
        sessionId: session.id,
        role: 'user',
        content: content.trim(),
      },
    });

    // 9. Lưu tin nhắn Assistant vào DB kèm số token tiêu thụ
    const savedReply = await this.prisma.chatMessage.create({
      data: {
        userId,
        sessionId: session.id,
        role: 'assistant',
        content: aiReply.trim(),
        tokensUsed,
        model,
      },
    });

    // 10. Cập nhật quota & nhiệm vụ học tập
    await this.recordTokenUsage(userId, tokensUsed);
    await this.statsService.incrementQuestProgress(userId, 'AI_CHAT', 1, 420);

    // 11. Tự động đổi tên tiêu đề nếu session đang mang tên mặc định
    if (
      session.title === 'Cuộc trò chuyện mới' ||
      session.title.startsWith('Học cùng ')
    ) {
      const summaryTitle = content.trim().slice(0, 30);
      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: {
          title: summaryTitle,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date() },
      });
    }

    // Lấy trạng thái quota mới nhất để trả về cho frontend cập nhật UI ngay lập tức
    const quota = await this.getQuotaStatus(userId);

    return {
      ...savedReply,
      sessionId: session.id,
      quota,
    };
  }
}
