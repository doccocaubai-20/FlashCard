import { Module } from '@nestjs/common';
import { HanziMnemonicsService } from './hanzi-mnemonics.service';
import { HanziMnemonicsController } from './hanzi-mnemonics.controller';

@Module({
  controllers: [HanziMnemonicsController],
  providers: [HanziMnemonicsService],
  exports: [HanziMnemonicsService],
})
export class HanziMnemonicsModule {}
