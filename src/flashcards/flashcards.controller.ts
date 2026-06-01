import { Controller, Req, Get, Post, Body, Query, Patch, Param, Delete, UseGuards, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { CreateFlashcardDto } from './dto/create-flashcard.dto';
import { UpdateFlashcardDto } from './dto/update-flashcard.dto';
import { Prisma } from '@prisma/client';
import { AuthGuard } from "@nestjs/passport";
import { CreateBulkFlashcardsDto } from './dto/create-bulk.dto';
@Controller('api/flashcards')
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Body() body: CreateFlashcardDto, @Req() req: any) {
    const userId = req.user.id;
    return this.flashcardsService.create(userId, req.user.role, body);
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'))
  async createBulk(@Body() body: CreateBulkFlashcardsDto, @Req() req: any) {
    const userId = req.user.id;
    console.log('Incoming data:', body)
    return this.flashcardsService.createBulk(
      userId,
      req.user.role,
      body.deckId,
      body.cards
    );
  }

  @Get()
  async findAll(@Query('deckId', ParseIntPipe) deckId: string) {
    if (!deckId) {
      throw new BadRequestException('deckId query parameter is required');
    }
    return this.flashcardsService.findAllByDeckId(+deckId);
  }
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: string) {
    return this.flashcardsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: string, @Body() updateFlashcardDto: Prisma.FlashcardUpdateInput) {
    return this.flashcardsService.update(+id, updateFlashcardDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: string) {
    return this.flashcardsService.remove(+id);
  }
}

