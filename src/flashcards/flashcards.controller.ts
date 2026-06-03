import { Controller, Req, Get, Post, Put, Body, Query, Patch, Param, Delete, UseGuards, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { CreateFlashcardDto } from './dto/create-flashcard.dto';
import { UpdateFlashcardDto } from './dto/update-flashcard.dto';
import { Prisma } from '@prisma/client';
import { AuthGuard } from "@nestjs/passport";
@Controller('api/flashcards')
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) { }

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
  async findAll(@Query('deckId', ParseIntPipe) deckId: number) {
    if (!deckId) {
      throw new BadRequestException('deckId query parameter is required');
    }
    return this.flashcardsService.findAllByDeckId(deckId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.flashcardsService.findOne(id);
  }

  @Patch(':id')
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateFlashcardDto: Prisma.FlashcardUpdateInput) {
    return this.flashcardsService.update(id, updateFlashcardDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.flashcardsService.remove(id);
  }
}

