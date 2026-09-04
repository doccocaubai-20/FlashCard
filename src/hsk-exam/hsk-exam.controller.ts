import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { HskExamService } from './hsk-exam.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/hsk-exams')
export class HskExamController {
  constructor(private readonly hskExamService: HskExamService) {}

  // 1. Get 6 levels with counts
  @Get('levels')
  async getLevels() {
    return this.hskExamService.getLevels();
  }

  // 2. Get tests by level (1 to 6)
  @Get('levels/:level')
  async getExamsByLevel(@Param('level', ParseIntPipe) level: number) {
    return this.hskExamService.getExamsByLevel(level);
  }

  // 3. Get all tests (flat list)
  @Get()
  async getExamsList() {
    return this.hskExamService.getExamsList();
  }

  // 4. Get results history for logged in user
  @Get('results')
  @UseGuards(AuthGuard('jwt'))
  async getResultsForUser(@Req() req: any) {
    const userId = req.user.id;
    return this.hskExamService.getResultsForUser(userId);
  }

  // 5. Get detail of an exam
  @Get('detail/:testId')
  async getExamDetail(@Param('testId') testId: string) {
    return this.hskExamService.getExamDetail(testId);
  }

  // Fallback route for testId
  @Get(':testId')
  async getExamDetailFallback(@Param('testId') testId: string) {
    return this.hskExamService.getExamDetail(testId);
  }

  // 6. Grade exam
  @Post(':testId/grade')
  async gradeExam(
    @Param('testId') testId: string,
    @Body('answers') answers: Record<string, string>,
  ) {
    return this.hskExamService.gradeExam(testId, answers || {});
  }

  // 7. Submit exam result to database
  @Post('submit')
  @UseGuards(AuthGuard('jwt'))
  async submitResult(
    @Req() req: any,
    @Body()
    body: {
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
    const userId = req.user.id;
    return this.hskExamService.submitResult(userId, body);
  }
}
