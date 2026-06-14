import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
