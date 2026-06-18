import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class HskExamService {
  constructor(private readonly prisma: PrismaService) {}

  // List of standard mock exams (Metadata)
  private readonly examsList = [
    {
      id: 'hsk1-mock-1',
      hskLevel: 1,
      title: 'Đề mô phỏng HSK 1',
      description: '40 câu - Nghe + Đọc - pinyin - audio 2 lần. Phù hợp cho trình độ nhập môn.',
      totalQuestions: 40,
      maxScore: 200,
      duration: 2100, // 35 minutes in seconds
      parts: ['Nghe (20 câu)', 'Đọc (20 câu)']
    },
    {
      id: 'hsk2-mock-1',
      hskLevel: 2,
      title: 'Đề mô phỏng HSK 2',
      description: '60 câu - Nghe + Đọc - pinyin - audio 2 lần. Đánh giá sơ cấp cơ bản.',
      totalQuestions: 60,
      maxScore: 200,
      duration: 3000, // 50 minutes in seconds
      parts: ['Nghe (35 câu)', 'Đọc (25 câu)']
    },
    {
      id: 'hsk3-mock-1',
      hskLevel: 3,
      title: 'Đề mô phỏng HSK 3',
      description: '80 câu - Nghe + Đọc + Viết - audio 1 lần. Đánh giá trung cấp 3.0.',
      totalQuestions: 80,
      maxScore: 300,
      duration: 5100, // 85 minutes in seconds
      parts: ['Nghe (40 câu)', 'Đọc (30 câu)', 'Viết (10 câu)']
    },
    {
      id: 'hsk6-mock-1',
      hskLevel: 6,
      title: 'Đề mô phỏng HSK 6',
      description: '101 câu - Audio gốc - Nghe + Đọc + Viết. Đánh giá trình độ cao cấp.',
      totalQuestions: 101,
      maxScore: 300,
      duration: 8100, // 135 minutes in seconds
      parts: ['Nghe (50 câu)', 'Đọc (50 câu)', 'Viết (1 câu)']
    }
  ];

  async getExamsList() {
    return this.examsList;
  }

  async getResultsForUser(userId: number) {
    return this.prisma.hskExamResult.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' }
    });
  }

  async submitResult(
    userId: number,
    data: {
      hskLevel: number;
      examTitle: string;
      score: number;
      maxScore: number;
      correctAnswers: number;
      totalQuestions: number;
      duration: number;
    }
  ) {
    return this.prisma.hskExamResult.create({
      data: {
        userId,
        hskLevel: data.hskLevel,
        examTitle: data.examTitle,
        score: data.score,
        maxScore: data.maxScore,
        correctAnswers: data.correctAnswers,
        totalQuestions: data.totalQuestions,
        duration: data.duration
      }
    });
  }
}
