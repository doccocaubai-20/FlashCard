import {
  Controller,
  Get,
  Put,
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
}
