import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SocialService } from './social.service';

@Controller('api/social')
@UseGuards(AuthGuard('jwt'))
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('leaderboard')
  getLeaderboard() {
    return this.socialService.getLeaderboard();
  }

  @Get('decks/public')
  getPublicDecks(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.socialService.getPublicDecks(+page, +limit);
  }

  @Post('decks/:id/share')
  shareDeck(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.socialService.shareDeck(id, req.user.id);
  }

  @Post('decks/import/:shareCode')
  importDeck(@Param('shareCode') shareCode: string, @Req() req: any) {
    return this.socialService.importDeck(shareCode, req.user.id);
  }
}
