import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReadingPassagesService {
  private readonly logger = new Logger(ReadingPassagesService.name);
  private cache: Map<number, any[]> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  private getDataDirs(): string[] {
    return [
      path.resolve(process.cwd(), 'data/reading-passages'),
      path.resolve(__dirname, '../../data/reading-passages'),
      path.resolve(__dirname, '../../../data/reading-passages'),
      path.resolve(process.cwd(), 'data'),
      path.resolve(__dirname, '../../data'),
    ];
  }

  // Đọc an toàn file JSON bài đọc
  private readPassagesForLevel(level: number): any[] {
    const candidates = [
      `hsk${level}.json`,
      `hsk${level < 7 ? level : '7_9'}.json`,
      `preview_reading_passages_hsk${level}.json`,
      `preview_reading_passages_hsk${level < 7 ? level : '7_9'}.json`,
    ];

    const dirs = this.getDataDirs();
    for (const dir of dirs) {
      for (const file of candidates) {
        const fullPath = path.join(dir, file);
        if (fs.existsSync(fullPath)) {
          try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch (err) {
            this.logger.error(`Failed to parse ${fullPath}: ${err.message}`);
          }
        }
      }
    }
    return [];
  }

  // 1. Lấy thống kê tổng quan các cấp độ bài đọc
  async getSummary() {
    const levelsSummary: any[] = [];
    let totalAll = 0;

    for (let lvl = 1; lvl <= 7; lvl++) {
      const passages = this.readPassagesForLevel(lvl);
      const count = passages.length;
      totalAll += count;
      levelsSummary.push({
        level: lvl,
        name: lvl === 7 ? 'HSK 7-9' : `HSK ${lvl}`,
        count,
        topicsCount: new Set(passages.map((p) => p.topicId)).size,
      });
    }

    return {
      totalPassages: totalAll,
      levels: levelsSummary,
    };
  }

  // 2. Lấy danh sách bài đọc theo cấp độ (tối ưu trả về danh sách thẻ bài)
  async getPassagesByLevel(level: number, topicId?: number) {
    const passages = this.readPassagesForLevel(level);

    let filtered = passages;
    if (topicId) {
      filtered = filtered.filter((p) => Number(p.topicId) === Number(topicId));
    }

    // Trả về metadata tinh gọn cho danh sách (tiết kiệm băng thông mạng)
    return filtered.map((p) => {
      const hanziText = p.content?.hanzi || '';
      const charCount = hanziText.replace(/[\n\s]/g, '').length;
      const snippet = p.contextDescription || (hanziText.slice(0, 100) + '...');

      return {
        id: p.id,
        hskLevel: p.hskLevel || level,
        topicId: p.topicId,
        topicName: p.topicName || `Chủ đề ${p.topicId}`,
        part: p.part || 1,
        totalParts: p.totalParts || 1,
        subTheme: p.subTheme || p.topicName,
        title: p.title || { hanzi: 'Bài đọc', pinyin: '', meaning: '' },
        contextDescription: p.contextDescription || '',
        snippet,
        charCount,
        targetWordsCount: p.targetWordsUsed?.length || 0,
        quizCount: p.quiz?.length || 0,
      };
    });
  }

  // 3. Lấy chi tiết toàn bộ 1 bài đọc (nội dung song ngữ, từ vựng, trắc nghiệm)
  async getPassageById(id: string) {
    // Trích xuất cấp độ từ ID nếu có (ví dụ: reading_hsk5_t08_p01 -> level 5, reading_hsk7_t01_p01 -> level 7)
    const match = id.match(/reading_hsk(\d+)_/);
    const searchLevels = match ? [Number(match[1])] : [1, 2, 3, 4, 5, 6, 7];

    for (const lvl of searchLevels) {
      const passages = this.readPassagesForLevel(lvl);
      const found = passages.find((p) => p.id === id);
      if (found) {
        return found;
      }
    }

    // Nếu tìm theo searchLevels chưa thấy, quét toàn bộ
    for (let lvl = 1; lvl <= 7; lvl++) {
      if (searchLevels.includes(lvl)) continue;
      const passages = this.readPassagesForLevel(lvl);
      const found = passages.find((p) => p.id === id);
      if (found) {
        return found;
      }
    }

    throw new NotFoundException(`Bài đọc '${id}' không tồn tại trên hệ thống.`);
  }

  // 4. Lưu tiến độ bài đọc & cộng điểm XP chống cày/hack điểm
  async saveProgress(
    userId: number,
    dto: {
      passageId: string;
      hskLevel: number;
      isRead?: boolean;
      quizScore?: number;
      quizTotal?: number;
    },
  ) {
    const { passageId, hskLevel, isRead = true, quizScore = 0, quizTotal = 0 } = dto;

    // Tìm kỷ lục trước đó của user cho bài này
    const existing = await this.prisma.userReadingProgress.findUnique({
      where: {
        userId_passageId: {
          userId,
          passageId,
        },
      },
    });

    const isQuizPassed = quizTotal > 0 && quizScore / quizTotal >= 0.75;
    const prevXpEarned = existing?.xpEarned || 0;
    const prevQuizScore = existing?.quizScore || 0;

    // Tính điểm XP có thể đạt được:
    // - Đọc xong bài: +10 XP
    // - Hoàn thành Quiz >= 75%: +20 XP, +5 Xu
    // Tổng XP tối đa của 1 bài là 30 XP
    const targetXp = (isRead ? 10 : 0) + (isQuizPassed ? 20 : 0);
    const xpDelta = Math.max(0, targetXp - prevXpEarned);
    const coinsDelta = isQuizPassed && prevXpEarned < 30 ? 5 : 0;

    const newScore = Math.max(prevQuizScore, quizScore);
    const newQuizTotal = Math.max(existing?.quizTotal || 0, quizTotal);

    // Cập nhật hoặc tạo mới bản ghi tiến độ trong database
    const progress = await this.prisma.userReadingProgress.upsert({
      where: {
        userId_passageId: {
          userId,
          passageId,
        },
      },
      create: {
        userId,
        passageId,
        hskLevel,
        isRead: true,
        quizScore: newScore,
        quizTotal: newQuizTotal,
        xpEarned: Math.max(prevXpEarned, targetXp),
        lastReadAt: new Date(),
      },
      update: {
        isRead: true,
        quizScore: newScore,
        quizTotal: newQuizTotal,
        xpEarned: Math.max(prevXpEarned, targetXp),
        lastReadAt: new Date(),
      },
    });

    // Nếu có điểm XP mới (chưa từng nhận trước đây) -> cộng vào UserStats
    if (xpDelta > 0 || coinsDelta > 0) {
      await this.prisma.userStats.upsert({
        where: { userId },
        create: {
          userId,
          xp: xpDelta,
          coins: coinsDelta,
        },
        update: {
          xp: { increment: xpDelta },
          coins: { increment: coinsDelta },
        },
      });
    }

    return {
      progress,
      xpAwarded: xpDelta,
      coinsAwarded: coinsDelta,
      isFirstCompletion: prevXpEarned === 0,
    };
  }

  // 5. Lấy toàn bộ tiến độ các bài đọc của người dùng
  async getUserProgress(userId: number, hskLevel?: number) {
    const where: any = { userId };
    if (hskLevel) {
      where.hskLevel = Number(hskLevel);
    }

    return this.prisma.userReadingProgress.findMany({
      where,
      orderBy: { lastReadAt: 'desc' },
    });
  }
}
