import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  ParseIntPipe,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DecksService } from './decks.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateDeckDto } from './dto/create-deck.dto';
import { SetMetadata } from '@nestjs/common';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@Controller('api/decks')
@UseGuards(AuthGuard('jwt'))
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Post()
  create(@Body() createDeckDto: CreateDeckDto, @Req() req: any) {
    return this.decksService.create(req.user.id, createDeckDto, req.user.role);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.decksService.findAllUserDecks(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const deck = await this.decksService.findOne(+id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return deck;
  }

  @Get(':id/flashcards')
  async findFlashcards(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return this.decksService.findFlashcardsByDeckId(id);
  }

  @Patch(':id')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() updateDeckDto: any,
  ) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (deck.userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bộ thẻ này!');
    }

    // Safety: prevent regular users from escalating permissions to isSystem or reassigning owner
    const cleanUpdate: any = {
      title: updateDeckDto.title,
      description: updateDeckDto.description,
    };
    if (req.user.role === 'ADMIN') {
      if (updateDeckDto.isSystem !== undefined)
        cleanUpdate.isSystem = updateDeckDto.isSystem;
      if (updateDeckDto.userId !== undefined)
        cleanUpdate.userId = updateDeckDto.userId;
    }

    return this.decksService.update(id, cleanUpdate);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const currentUserId = req.user.id;
    return this.decksService.remove(+id, currentUserId, req.user.role);
  }

  @Delete('system/:id')
  @UseGuards(RolesGuard)
  @SetMetadata('roles', ['ADMIN'])
  removeSystemDeck(@Param('id', ParseIntPipe) id: number) {
    return this.decksService.removeSystemDeck(id);
  }

  @Post(':id/generate-paragraph')
  async generateParagraph(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { words?: string[] },
    @Req() req: any,
  ) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return this.decksService.generateParagraph(
      id,
      body.words || [],
      req.user.id,
    );
  }

  @Post(':id/paragraphs')
  async saveParagraph(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      hanzi: string;
      pinyin: string;
      meaning: string;
      words: string[];
      wordUsage: any;
    },
    @Req() req: any,
  ) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return this.decksService.saveParagraph(id, req.user.id, body);
  }

  @Get(':id/paragraphs')
  async getSavedParagraphs(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return this.decksService.getSavedParagraphs(id, req.user.id);
  }

  @Delete(':id/paragraphs/:paragraphId')
  async deleteSavedParagraph(
    @Param('id', ParseIntPipe) id: number,
    @Param('paragraphId', ParseIntPipe) paragraphId: number,
    @Req() req: any,
  ) {
    const deck = await this.decksService.findOne(id);
    if (!deck) {
      throw new NotFoundException('Không tìm thấy bộ thẻ!');
    }
    if (
      !deck.isSystem &&
      deck.userId !== req.user.id &&
      req.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập bộ thẻ này!');
    }
    return this.decksService.deleteSavedParagraph(paragraphId, req.user.id);
  }

  @Post('generate-from-text')
  async generateFromText(
    @Body() body: { text: string; deckTitle?: string },
    @Req() req: any,
  ) {
    return this.decksService.generateDeckFromText(
      req.user.id,
      body.text,
      body.deckTitle || 'Từ vựng trích xuất AI',
      req.user.role,
    );
  }
}
