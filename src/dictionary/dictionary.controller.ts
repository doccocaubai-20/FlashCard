import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { DictionaryService } from './dictionary.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get('search')
  async search(
    @Query('type') type: string,
    @Query('q') q: string,
    @Query('multiple') multiple?: string,
  ) {
    if (!type || !q) {
      throw new BadRequestException(
        'Query parameters "type" and "q" are required',
      );
    }
    const isMultiple = multiple === 'true';
    return this.dictionaryService.search(type, q, isMultiple);
  }

  @Get('hsk')
  async getHskWords(
    @Query('level', ParseIntPipe) level: number,
    @Query('limit') limit?: string,
  ) {
    const maxLimit = limit ? parseInt(limit, 10) : 50;
    return this.dictionaryService.getHskWords(level, maxLimit);
  }

  @Get('wotd')
  async getWordOfTheDay() {
    return this.dictionaryService.getWordOfTheDay();
  }

  @Get('syllables')
  async getSyllables() {
    return this.dictionaryService.getSyllables();
  }

  @Get('syllable-details')
  async getSyllableDetails(@Query('syllable') syllable: string) {
    if (!syllable) {
      throw new BadRequestException('Query parameter "syllable" is required');
    }
    return this.dictionaryService.getSyllableDetails(syllable);
  }

  @Get('radical')
  async getWordsByRadical(@Query('char') char: string) {
    if (!char) {
      throw new BadRequestException('Query parameter "char" is required');
    }
    return this.dictionaryService.getWordsByRadical(char);
  }

  @Post('compare-synonyms')
  @UseGuards(AuthGuard('jwt'))
  compareSynonyms(@Body() body: { word1: string; word2: string }) {
    if (!body.word1 || !body.word2) {
      throw new BadRequestException('Hai từ để so sánh là bắt buộc!');
    }
    return this.dictionaryService.compareSynonyms(body.word1, body.word2);
  }

  @Post('ocr-analyze')
  @UseGuards(AuthGuard('jwt'))
  ocrAnalyze(@Body() body: { text: string }) {
    if (!body.text) {
      throw new BadRequestException('Văn bản nhận diện là bắt buộc!');
    }
    return this.dictionaryService.ocrAnalyze(body.text);
  }
}
