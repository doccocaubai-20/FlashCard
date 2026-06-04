import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FavoriteWordService } from './favoriteWord.service';
import { CreateFavoriteWordDto } from './dto/favoriteWord.dto';

@Controller('api/favorite-words')
@UseGuards(AuthGuard('jwt'))
export class FavoriteWordController {
  constructor(private readonly favoriteWordService: FavoriteWordService) { }

  @Get()
  async getAllFavoriteWords(@Req() req: any) {
    const userId = req.user.id;
    return this.favoriteWordService.getAllFavoriteWords(userId);
  }

  @Post()
  async addFavoriteWord(
    @Req() req: any,
    @Body() dto: CreateFavoriteWordDto
  ) {
    const userId = req.user.id;
    return this.favoriteWordService.addFavoriteWord(userId, dto);
  }

  @Delete(':id')
  async deleteFavoriteWord(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number
  ) {
    const userId = req.user.id;
    return this.favoriteWordService.deleteFavoriteWord(userId, id);
  }

  @Delete('hanzi/:hanzi')
  async deleteFavoriteWordByHanzi(
    @Req() req: any,
    @Param('hanzi') hanzi: string
  ) {
    const userId = req.user.id;
    return this.favoriteWordService.deleteFavoriteWordByHanzi(userId, hanzi);
  }
}
