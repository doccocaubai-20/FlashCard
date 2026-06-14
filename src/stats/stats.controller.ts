import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StatsService } from './stats.service';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('summary')
  @UseGuards(AuthGuard('jwt'))
  async getSummary(@Req() req: any, @Query('tzOffset') tzOffsetStr?: string) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    return this.statsService.getSummary(userId, tzOffset);
  }

  @Get('heatmap')
  @UseGuards(AuthGuard('jwt'))
  async getHeatmap(@Req() req: any, @Query('tzOffset') tzOffsetStr?: string) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    return this.statsService.getHeatmap(userId, tzOffset);
  }

  @Get('badges')
  @UseGuards(AuthGuard('jwt'))
  async getBadges(@Req() req: any) {
    const userId = req.user.id;
    return this.statsService.getBadges(userId);
  }

  @Put('goals')
  @UseGuards(AuthGuard('jwt'))
  async updateGoals(@Req() req: any, @Body() body: { dailyTarget: number }) {
    const userId = req.user.id;
    return this.statsService.updateGoals(userId, body.dailyTarget);
  }

  @Put('add-xp-coins')
  @UseGuards(AuthGuard('jwt'))
  async addXpCoins(
    @Req() req: any,
    @Body() body: { xp: number; coins: number },
  ) {
    const userId = req.user.id;
    return this.statsService.updateXPAndCoins(userId, body.xp, body.coins);
  }

  @Post('buy-item')
  @UseGuards(AuthGuard('jwt'))
  async buyItem(@Req() req: any, @Body() body: { price: number; itemType: string }) {
    const userId = req.user.id;
    return this.statsService.buyItem(userId, body.price, body.itemType);
  }

  @Post('use-xp-boost')
  @UseGuards(AuthGuard('jwt'))
  async useXpBoost(@Req() req: any) {
    const userId = req.user.id;
    return this.statsService.useXpBoost(userId);
  }

  @Get('quests')
  @UseGuards(AuthGuard('jwt'))
  async getQuests(@Req() req: any, @Query('tzOffset') tzOffsetStr?: string) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    return this.statsService.getDailyQuests(userId, tzOffset);
  }

  @Put('quests/progress')
  @UseGuards(AuthGuard('jwt'))
  async incrementQuestProgress(
    @Req() req: any,
    @Body() body: { questType: string; amount: number; tzOffset?: number },
  ) {
    const userId = req.user.id;
    const tzOffset = body.tzOffset !== undefined ? body.tzOffset : 420;
    return this.statsService.incrementQuestProgress(
      userId,
      body.questType,
      body.amount,
      tzOffset,
    );
  }

  @Get('daily-quiz')
  @UseGuards(AuthGuard('jwt'))
  async getDailyQuiz(@Req() req: any, @Query('tzOffset') tzOffsetStr?: string) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    return this.statsService.getDailyQuiz(userId, tzOffset);
  }

  @Get('garden')
  @UseGuards(AuthGuard('jwt'))
  async getGardenState(@Req() req: any, @Query('tzOffset') tzOffsetStr?: string) {
    const userId = req.user.id;
    const tzOffset =
      tzOffsetStr !== undefined ? parseInt(tzOffsetStr, 10) : 420;
    return this.statsService.getGardenState(userId, tzOffset);
  }

  @Post('garden/harvest')
  @UseGuards(AuthGuard('jwt'))
  async harvestGarden(@Req() req: any, @Body() body: { tzOffset?: number }) {
    const userId = req.user.id;
    const tzOffset = body.tzOffset !== undefined ? body.tzOffset : 420;
    return this.statsService.harvestGarden(userId, tzOffset);
  }
}
