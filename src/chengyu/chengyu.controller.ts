import { Controller, Get, Param, Query } from '@nestjs/common';
import { ChengyuService } from './chengyu.service';

@Controller('api/chengyu')
export class ChengyuController {
  constructor(private readonly chengyuService: ChengyuService) {}

  @Get('summary')
  getSummary() {
    return this.chengyuService.getSummary();
  }

  @Get('list')
  getList(
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chengyuService.getList({
      category,
      level,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.chengyuService.getDetail(id);
  }
}
