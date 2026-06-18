import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { HskExamService } from './hsk-exam.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/hsk-exams')
@UseGuards(AuthGuard('jwt'))
export class HskExamController {
  constructor(private readonly hskExamService: HskExamService) {}

  @Get()
  async getExamsList() {
    return this.hskExamService.getExamsList();
  }

  @Get('results')
  async getResultsForUser(@Req() req: any) {
    const userId = req.user.id;
    return this.hskExamService.getResultsForUser(userId);
  }

  @Post('submit')
  async submitResult(
    @Req() req: any,
    @Body()
    body: {
      hskLevel: number;
      examTitle: string;
      score: number;
      maxScore: number;
      correctAnswers: number;
      totalQuestions: number;
      duration: number;
    },
  ) {
    const userId = req.user.id;
    return this.hskExamService.submitResult(userId, body);
  }
}
