import { Module } from '@nestjs/common';
import { GameRecordsService } from './game-records.service';
import { GameRecordsController } from './game-records.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GameRecordsController],
  providers: [GameRecordsService],
  exports: [GameRecordsService],
})
export class GameRecordsModule {}
