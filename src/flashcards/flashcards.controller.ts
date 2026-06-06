import {
  Controller,
  Req,
  Get,
  Post,
  Put,
  Body,
  Query,
  Patch,
  Param,
  Delete,
  UseGuards,
  BadRequestException,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { CreateFlashcardDto } from './dto/create-flashcard.dto';
import { Prisma } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
@Controller('api/flashcards')
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Body() body: CreateFlashcardDto, @Req() req: any) {
    const userId = req.user.id;
    return this.flashcardsService.create(userId, req.user.role, body);
  }

  @Post('bulk-import')
  @UseGuards(AuthGuard('jwt'))
  async bulkImport(@Body() body: any[], @Req() req: any) {
    const userId = req.user.id;
    return this.flashcardsService.bulkImport(userId, req.user.role, body);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll(
    @Query('deckId', ParseIntPipe) deckId: number,
    @Req() req: any,
  ) {
    if (!deckId) {
      throw new BadRequestException('deckId query parameter is required');
    }
    return this.flashcardsService.findAllByDeckId(
      deckId,
      req.user.id,
      req.user.role,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.flashcardsService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() updateFlashcardDto: Prisma.FlashcardUpdateInput,
  ) {
    return this.flashcardsService.update(
      id,
      req.user.id,
      req.user.role,
      updateFlashcardDto,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.flashcardsService.remove(id, req.user.id, req.user.role);
  }

  @Post('ai-generate')
  @UseGuards(AuthGuard('jwt'))
  async generateWithAI(
    @Req() req: any,
    @Body()
    body: {
      topic: string;
      count?: number;
      hskLevel?: number;
      excludeWords?: string[];
    },
  ) {
    const { topic, count = 10, hskLevel, excludeWords } = body;
    if (!topic || topic.trim().length === 0) {
      throw new HttpException('Vui lòng nhập chủ đề!', HttpStatus.BAD_REQUEST);
    }
    const safeCount = Math.min(Math.max(count, 5), 30);
    try {
      const cards = await this.flashcardsService.generateWithAI(
        req.user.id,
        topic.trim(),
        safeCount,
        hskLevel,
        excludeWords,
      );
      return { cards, topic: topic.trim(), count: cards.length };
    } catch (err) {
      const error = err as any;
      throw new HttpException(
        error?.message || 'Lỗi tạo flashcard bằng AI!',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
