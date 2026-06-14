import { Module } from '@nestjs/common';
import { FavoriteWordController } from './favoriteWord.controller';
import { FavoriteWordService } from './favoriteWord.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [FavoriteWordController],
  providers: [FavoriteWordService],
  exports: [FavoriteWordService],
})
export class FavoriteWordModule {}
