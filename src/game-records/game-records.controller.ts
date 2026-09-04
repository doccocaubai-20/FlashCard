import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GameRecordsService } from './game-records.service';

@Controller('api/game-records')
@UseGuards(AuthGuard('jwt'))
export class GameRecordsController {
  constructor(private readonly gameRecordsService: GameRecordsService) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.gameRecordsService.create(req.user.id, body);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('gameType') gameType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gameRecordsService.findAll(
      req.user.id,
      gameType,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('best')
  findBest(@Req() req: any, @Query('gameType') gameType: string) {
    return this.gameRecordsService.findBest(req.user.id, gameType);
  }
}
