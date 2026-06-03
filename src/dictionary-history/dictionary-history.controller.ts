import { Controller, Get, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

  @Post()
  createOrUpdate(@Req() req: any, @Body() dto: CreateHistoryDto) {
    return this.dictionaryHistoryService.createOrUpdate(req.user.id, dto);
  }

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
