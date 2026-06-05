import { Controller, Get, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { DictionaryHistoryService } from './dictionary-history.service';
import { CreateHistoryDto } from './dto/create-history.dto';

@Controller('api/dictionary-history')
@UseGuards(AuthGuard('jwt'))
export class DictionaryHistoryController {
  constructor(private readonly dictionaryHistoryService: DictionaryHistoryService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.dictionaryHistoryService.findAll(req.user.id);
  }

  @Get('today-count')
  getTodayCount(@Req() req: any) {
    return this.dictionaryHistoryService.getTodayCount(req.user.id);
  }

  @Post()
  createOrUpdate(@Req() req: any, @Body() dto: CreateHistoryDto) {
    return this.dictionaryHistoryService.createOrUpdate(req.user.id, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('explain')
  explain(
    @Req() req: any,
    @Body() body: { hanzi: string; traditional?: string; pinyin?: string; sv?: string; vi?: string; en?: string }
  ) {
    return this.dictionaryHistoryService.explain(req.user.id, body);
  }

  @Delete()
  clearHistory(@Req() req: any) {
    return this.dictionaryHistoryService.clearHistory(req.user.id);
  }
}
