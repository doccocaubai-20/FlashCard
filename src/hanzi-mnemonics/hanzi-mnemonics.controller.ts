import { Controller, Get, Param, Query } from '@nestjs/common';
import { HanziMnemonicsService } from './hanzi-mnemonics.service';

@Controller('api/hanzi-mnemonics')
export class HanziMnemonicsController {
  constructor(private readonly mnemonicsService: HanziMnemonicsService) {}

  @Get('summary')
  getSummary() {
    return this.mnemonicsService.getSummary();
  }

  @Get('list')
  getList(
    @Query('level') level?: string,
    @Query('radical') radical?: string,
    @Query('etymology') etymology?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.mnemonicsService.getList({
      level,
      radical,
      etymology,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 24,
    });
  }

  @Get(':char')
  getByChar(@Param('char') char: string) {
    return this.mnemonicsService.getByChar(char);
  }
}
