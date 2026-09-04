import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

@Injectable()
export class HskExamService {
  private readonly logger = new Logger(HskExamService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getDataDir(): string {
    const candidates = [
      path.resolve(process.cwd(), 'data/hsk-exams'),
      path.resolve(__dirname, '../../data/hsk-exams'),
      path.resolve(__dirname, '../../../data/hsk-exams'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  // Helper to read JSON file safely
  private readJsonFile(filename: string): any | null {
    try {
      const dataDir = this.getDataDir();
      const filePath = path.join(dataDir, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      this.logger.error(`Error reading ${filename}: ${e.message}`);
    }
    return null;
  }

  // 1. Get all 6 HSK levels and counts
  async getLevels() {
    const data = this.readJsonFile('levels.json');
    if (data && data.levels) {
      return data.levels;
    }
    // Fallback if file not yet ready
    return [
      { level: 1, count: 9 },
      { level: 2, count: 7 },
      { level: 3, count: 16 },
      { level: 4, count: 6 },
      { level: 5, count: 19 },
      { level: 6, count: 20 },
    ];
  }

  // 2. Get tests for a specific level (1-6)
  async getExamsByLevel(level: number) {
    const data = this.readJsonFile(`level-${level}.json`);
    if (data && data.items) {
      return data.items;
    }
    // Fallback: search all-exams.json
    const all = this.readJsonFile('all-exams.json');
    if (Array.isArray(all)) {
      return all.filter((item: any) => item.level === level);
    }
    return [];
  }

  // 3. Get all exams list (Flat)
  async getExamsList() {
    const all = this.readJsonFile('all-exams.json');
    if (Array.isArray(all)) {
      return all;
    }
    // Collect from level files
    const result: any[] = [];
    for (let l = 1; l <= 6; l++) {
      const items = await this.getExamsByLevel(l);
      result.push(...items);
    }
    return result;
  }

  // 4. Get full exam details (with auto-fallback to live API if not yet synced)
  async getExamDetail(testId: string) {
    const local = this.readJsonFile(`${testId}.json`);
    if (local) {
      return local;
    }

    // Attempt to extract level from testId (e.g. "hsk1-1" -> level 1)
    const match = testId.match(/hsk(\d)/i);
    const level = match ? parseInt(match[1], 10) : 1;

    this.logger.log(`Test ${testId} not found locally. Fetching on demand...`);
    try {
      const rawDetail: any = await this.fetchJson(
        `https://api.xiehanzi.com/api/v1/hsk-tests/levels/${level}/${testId}`,
      );
      if (!rawDetail || !rawDetail.sections) {
        throw new NotFoundException(`Không tìm thấy đề thi ${testId}`);
      }

      // Fetch answer key from /grade
      let answerMap: Record<string, string> = {};
      try {
        const gradeRes: any = await this.postJson(
          `https://api.xiehanzi.com/api/v1/hsk-tests/${testId}/grade`,
          { answers: {} },
        );
        if (gradeRes && gradeRes.sections) {
          gradeRes.sections.forEach((s: any) => {
            s.questions?.forEach((q: any) => {
              if (q.answer) answerMap[q.id] = q.answer;
            });
          });
        }
      } catch (err) {
        this.logger.warn(`Could not get grade key for ${testId}: ${err.message}`);
      }

      // Format questions with imageUrls and correctAnswer
      if (rawDetail.sections) {
        rawDetail.sections.forEach((sec: any) => {
          sec.questions?.forEach((q: any) => {
            if (answerMap[q.id]) {
              q.correctAnswer = answerMap[q.id];
            }
            if (q.images && q.images.length > 0) {
              q.imageUrls = q.images.map((imgRel: string) => {
                const found = rawDetail.images?.find((item: any) => item.path === imgRel);
                return found ? found.src : `https://static.xiehanzi.com/hsk-tests/${testId}/${imgRel}`;
              });
            } else {
              q.imageUrls = [];
            }
          });
        });
      }

      rawDetail.answerMap = answerMap;
      rawDetail.durationMinutes = level === 1 ? 35 : level === 2 ? 50 : level === 3 ? 85 : level === 4 ? 100 : level === 5 ? 125 : 140;

      // Cache to disk
      try {
        const dataDir = this.getDataDir();
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(dataDir, `${testId}.json`),
          JSON.stringify(rawDetail, null, 2),
          'utf8',
        );
      } catch (writeErr) {
        this.logger.warn(`Could not cache ${testId}.json: ${writeErr.message}`);
      }

      return rawDetail;
    } catch (e) {
      this.logger.error(`Failed to fetch exam ${testId}: ${e.message}`);
      throw new NotFoundException(`Đề thi ${testId} không tồn tại hoặc lỗi tải.`);
    }
  }

  // 5. Grade exam with user answers
  async gradeExam(testId: string, answers: Record<string, string>) {
    const exam = await this.getExamDetail(testId);
    let totalQuestions = 0;
    let correctCount = 0;

    const sectionsResult: any[] = [];

    (exam.sections || []).forEach((sec: any) => {
      let secCorrect = 0;
      let secTotal = 0;
      const questionsResult: any[] = [];

      (sec.questions || []).forEach((q: any) => {
        secTotal++;
        totalQuestions++;
        const userChoice = answers[q.id] || null;
        const expected = q.correctAnswer || (exam.answerMap && exam.answerMap[q.id]);

        // Normalize comparison (handle True/False symbols vs boolean words)
        let isCorrect = false;
        if (userChoice && expected) {
          const u = String(userChoice).trim().toLowerCase();
          const e = String(expected).trim().toLowerCase();
          if (u === e) {
            isCorrect = true;
          } else if (
            (u === 'true' && (e === '√' || e === 'true')) ||
            (u === 'false' && (e === '×' || e === 'false')) ||
            (u === '√' && e === 'true') ||
            (u === '×' && e === 'false')
          ) {
            isCorrect = true;
          }
        }

        if (isCorrect) {
          secCorrect++;
          correctCount++;
        }

        questionsResult.push({
          id: q.id,
          number: q.number,
          selected: userChoice,
          answer: expected,
          isCorrect,
        });
      });

      sectionsResult.push({
        id: sec.id,
        title: sec.title || (sec.id === 'listening' ? 'Listening' : sec.id === 'reading' ? 'Reading' : 'Writing'),
        correct: secCorrect,
        total: secTotal,
        questions: questionsResult,
      });
    });

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return {
      testId,
      score, // 0 to 100 percentage
      correct: correctCount,
      total: totalQuestions,
      sections: sectionsResult,
    };
  }

  // 6. Save completed result for user
  async submitResult(
    userId: number,
    data: {
      testId?: string;
      hskLevel: number;
      examTitle: string;
      score: number;
      maxScore: number;
      correctAnswers: number;
      totalQuestions: number;
      duration: number;
      sectionScores?: any;
      userAnswers?: any;
    },
  ) {
    return this.prisma.hskExamResult.create({
      data: {
        userId,
        testId: data.testId || null,
        hskLevel: data.hskLevel,
        examTitle: data.examTitle,
        score: data.score,
        maxScore: data.maxScore,
        correctAnswers: data.correctAnswers,
        totalQuestions: data.totalQuestions,
        duration: data.duration,
        sectionScores: data.sectionScores || null,
        userAnswers: data.userAnswers || null,
      },
    });
  }

  // 7. Get user's exam attempts history
  async getResultsForUser(userId: number) {
    return this.prisma.hskExamResult.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
    });
  }

  // Helper HTTP GET
  private fetchJson(url: string) {
    return new Promise((resolve, reject) => {
      https.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Accept: 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        },
      ).on('error', reject);
    });
  }

  // Helper HTTP POST
  private postJson(url: string, data: any) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'Mozilla/5.0',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve(body);
            }
          });
        },
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}
