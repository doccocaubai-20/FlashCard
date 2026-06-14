import { Module } from '@nestjs/common';
import { DictionaryHistoryService } from './dictionary-history.service';
import { DictionaryHistoryController } from './dictionary-history.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [DictionaryHistoryController],
  providers: [DictionaryHistoryService],
})
export class DictionaryHistoryModule {}
