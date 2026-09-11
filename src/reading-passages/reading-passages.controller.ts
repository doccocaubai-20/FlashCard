import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReadingPassagesService } from './reading-passages.service';

@Controller('api/reading-passages')
export class ReadingPassagesController {
  constructor(
    private readonly readingPassagesService: ReadingPassagesService,
  ) {}

  // 1. Tóm tắt danh mục cấp độ HSK và số lượng bài đọc (Public)
  @Get('summary')
  getSummary() {
    return this.readingPassagesService.getSummary();
  }

  // 2. Lấy danh sách bài đọc theo cấp độ (Public)
  @Get('level/:level')
  getPassagesByLevel(
    @Param('level', ParseIntPipe) level: number,
    @Query('topicId') topicId?: number,
  ) {
    return this.readingPassagesService.getPassagesByLevel(level, topicId ? Number(topicId) : undefined);
  }

  // 3. Lấy toàn bộ tiến độ đọc của người dùng hiện tại (Protected)
  @Get('user-progress')
  @UseGuards(AuthGuard('jwt'))
  getUserProgress(
    @Req() req: any,
    @Query('hskLevel') hskLevel?: number,
  ) {
    return this.readingPassagesService.getUserProgress(req.user.id, hskLevel ? Number(hskLevel) : undefined);
  }

  // 4. Lấy chi tiết toàn bộ 1 bài đọc (Public)
  @Get(':id')
  getPassageById(@Param('id') id: string) {
    return this.readingPassagesService.getPassageById(id);
  }

  // 5. Lưu tiến độ bài đọc & cộng điểm XP chống hack (Protected)
  @Post('progress')
  @UseGuards(AuthGuard('jwt'))
  saveProgress(@Req() req: any, @Body() body: any) {
    return this.readingPassagesService.saveProgress(req.user.id, body);
  }
}
