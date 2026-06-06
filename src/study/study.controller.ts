import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StudyService } from './study.service';

@Controller('api/study')
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Get('today')
  @UseGuards(AuthGuard('jwt'))
  async getToday(
    @Req() req: any,
    @Query('tzOffset') tzOffsetStr?: string,
    @Query('extra') extraStr?: string,
    @Query('deckId') deckIdStr?: string,
  ) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    const extra = extraStr !== undefined ? parseInt(extraStr, 10) : undefined;
    const deckId =
      deckIdStr !== undefined ? parseInt(deckIdStr, 10) : undefined;
    return this.studyService.getTodayCards(userId, tzOffset, extra, deckId);
  }

  @Get('all-cards')
  @UseGuards(AuthGuard('jwt'))
  async getAllCards(@Req() req: any) {
    const userId = req.user.id;
    return this.studyService.getAllCards(userId);
  }

  @Post('review')
  @UseGuards(AuthGuard('jwt'))
  async review(
    @Req() req: any,
    @Body() body: { cardId: number; rating: number; tzOffset?: number },
  ) {
    const userId = req.user.id;
    return this.studyService.submitReview(userId, body);
  }
}
