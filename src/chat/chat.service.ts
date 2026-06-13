import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(userId: number) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async clearHistory(userId: number) {
    return this.prisma.chatMessage.deleteMany({
      where: { userId },
    });
  }

  async sendMessage(userId: number, content: string) {
    if (!content || !content.trim()) {
      throw new HttpException('Nội dung tin nhắn không được để trống.', HttpStatus.BAD_REQUEST);
    }

    // 1. Lấy lịch sử 20 tin nhắn gần nhất làm context cho AI
    const history = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    
    // Đảo ngược lại để đúng thứ tự thời gian tăng dần
    const sortedHistory = history.reverse();

    // 2. Lấy API key và model DeepSeek từ biến môi trường
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key is not configured on the server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 3. Chuẩn bị system prompt đặc biệt định hướng vai trò AI
    const systemPrompt = `Bạn là ChongZi AI, một trợ lý học tiếng Trung và là tư vấn viên hỗ trợ website ChongZi. Hãy giúp người dùng giải đáp các thắc mắc về từ vựng, ngữ pháp HSK, luyện dịch, viết chữ Hán, phát âm.
Đồng thời, nếu người dùng hỏi về cách sử dụng web ChongZi, hãy hướng dẫn họ đến các tính năng tương ứng trên thanh menu (Sidebar) hoặc Study Hub:
- Dashboard (Trang chủ): Xem từ vựng của ngày, tiến độ học, heatmap hoạt động.
- Bộ bài: Ôn tập thẻ từ vựng với thuật toán lặp lại ngắt quãng (SRS) hoặc học chế độ nghe thụ động.
- AI Chatbot: Trò chuyện và hỏi đáp trực tiếp (chính là bạn).
- Bảng xếp hạng: Cạnh tranh điểm học tập với mọi người.
- Khu học tập HSK: Gồm có:
  + Luyện nói tự do (Speaking Sandbox): Nói tiếng Trung tự do để nhận diện bính âm và tra cứu từ vựng.
  + Luyện viết tự do HSK (Scribble Write): Tập viết chữ bừa bãi và có AI nhận diện, tra từ điển.
  + Trắc nghiệm (Quiz): Làm bài tập trắc nghiệm 4 đáp án để nhớ từ (hỗ trợ phím tắt 1-4, Enter/Space, ẩn hiện Pinyin).
  + Luyện viết chữ Hán (Free Write): Xem hướng dẫn nét vẽ chi tiết từng chữ.
  + Luyện nói câu mẫu (Speaking): Thu âm nói theo câu mẫu và chấm điểm độ chính xác.
  + Luyện dịch câu (Translation): Bài tập dịch Trung-Việt chấm điểm theo từ khóa.
  + Luyện hội thoại (Dialogue): Các bài hội thoại mẫu kèm phát âm.
- Đấu trường game: Gồm Lật thẻ (Matching), Xếp câu (Unscramble), Mưa từ vựng (Falling Words), Nghe viết chính tả (Dictation).
- Tra cứu & Thư viện: Từ điển Hán-Việt siêu mạnh (hỗ trợ giải thích AI, nhận diện nét vẽ tay), 214 Bộ thủ, Bảng âm Pinyin tương tác, Ngữ pháp HSK.
- Cài đặt: Đổi avatar, đổi mật khẩu, chuyển đổi chế độ tối/sáng (Dark/Light Mode).
- Sổ tay từ vựng: Lưu giữ các từ yêu thích, hỗ trợ export CSV/PDF.

Hãy trả lời thân thiện, mạch lạc, ngắn gọn và sử dụng Markdown nếu cần thiết để ví dụ chữ Hán và Pinyin rõ ràng. Trả lời bằng ngôn ngữ người dùng nói (thường là Tiếng Việt).`;

    let customSystemPrompt = systemPrompt;
    const lowerContent = content.toLowerCase();

    if (
      lowerContent.includes('bộ bài') ||
      lowerContent.includes('bài học') ||
      lowerContent.includes('deck') ||
      lowerContent.includes('từ vựng') ||
      lowerContent.includes('thẻ') ||
      lowerContent.includes('học từ')
    ) {
      try {
        // 1. Lấy danh sách các bộ bài hiện có kèm số lượng từ (không lấy chi tiết flashcard để tiết kiệm token)
        const decks = await this.prisma.deck.findMany({
          where: {
            OR: [
              { userId },
              { isPublic: true },
              { isSystem: true },
            ],
          },
          include: {
            _count: {
              select: { flashcards: true },
            },
          },
        });

        // 2. Tìm xem tin nhắn của người dùng có đề cập đến tên bộ bài nào cụ thể không
        const matchedDecks = decks.filter((d) =>
          lowerContent.includes(d.title.toLowerCase()),
        );

        let decksSummary = '';
        if (matchedDecks.length > 0) {
          // Người dùng chỉ định rõ tên bộ bài -> Chỉ nạp từ vựng của bộ bài đó (Giới hạn tối đa 50 từ)
          const matchedDecksWithCards = await this.prisma.deck.findMany({
            where: {
              id: { in: matchedDecks.map((d) => d.id) },
            },
            include: {
              flashcards: {
                take: 50, // Giới hạn tối đa 50 từ để tránh quá tải token
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

          decksSummary = matchedDecksWithCards
            .map((d) => {
              const cardsInfo = d.flashcards
                .map((f) => {
                  let info = `${f.hanzi} (${f.pinyin}: ${f.meaning})`;
                  if (f.exampleHanzi) {
                    info += ` [Ví dụ gốc: ${f.exampleHanzi} (${f.examplePinyin}): ${f.exampleMeaning}]`;
                  }
                  return info;
                })
                .join(', ');

              const totalCount = decks.find((x) => x.id === d.id)?._count?.flashcards || 0;
              const limitText = totalCount > 50 ? ` (Đang nạp 50/${totalCount} từ tiêu biểu để tối ưu)` : '';
              return `- Bộ bài "${d.title}" (ID: ${d.id})${limitText}: ${cardsInfo || 'Chưa có từ vựng nào'}`;
            })
            .join('\n');

          customSystemPrompt += `\n\n[Dữ liệu Bộ bài trùng khớp của học viên]:\n${decksSummary}\n\nHọc viên đang muốn học các từ vựng này. Hãy giải thích nghĩa, đọc các câu ví dụ mẫu gốc hoặc tạo các câu mới có nghĩa tự nhiên chứa các từ này để giảng dạy cho học viên.`;
        } else {
          // Người dùng nói chung chung -> Chỉ liệt kê tên các bộ bài và số lượng từ để họ chọn
          decksSummary = decks
            .map((d) => `- "${d.title}" (có ${d._count.flashcards} từ)`)
            .join('\n');

          customSystemPrompt += `\n\n[Danh sách Bộ bài hiện có của học viên]:\n${decksSummary}\n\nHọc viên chưa chỉ định rõ bộ bài cụ thể nào. Hãy liệt kê thân thiện danh sách các bộ bài trên kèm số lượng từ, hỏi học viên muốn ôn tập bộ bài nào và nhắc họ gõ đúng tên bộ bài để bạn nạp từ vựng. Tuyệt đối không tự đoán mò từ vựng của bộ bài nếu chưa được nạp.`;
        }
      } catch (dbErr) {
        console.error('Failed to fetch user decks for chatbot context:', dbErr);
      }
    }

    // 4. Xây dựng danh sách tin nhắn gửi lên API
    const apiMessages = [
      { role: 'system', content: customSystemPrompt },
      ...sortedHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: content.trim() },
    ];

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
            messages: apiMessages,
            temperature: 0.6,
            max_tokens: 2000,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      const aiReply = resJson.choices[0].message.content || '';

      // 5. Lưu cả tin nhắn của user và câu trả lời của AI vào DB
      await this.prisma.chatMessage.create({
        data: {
          userId,
          role: 'user',
          content: content.trim(),
        },
      });

      const savedReply = await this.prisma.chatMessage.create({
        data: {
          userId,
          role: 'assistant',
          content: aiReply.trim(),
        },
      });

      return savedReply;
    } catch (err) {
      console.error('Failed to communicate with DeepSeek in ChatService:', err);
      const error = err as any;
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận, vui lòng thử lại sau vài giây!'
          : 'Không thể kết nối tới AI: ' + (error.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
