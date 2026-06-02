import { Module } from '@nestjs/common';
import { DictionaryHistoryService } from './dictionary-history.service';
import { DictionaryHistoryController } from './dictionary-history.controller';

@Module({
  controllers: [DictionaryHistoryController],
  providers: [DictionaryHistoryService],
})
export class DictionaryHistoryModule {}
