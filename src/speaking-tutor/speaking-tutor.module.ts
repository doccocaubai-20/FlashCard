import { Module } from '@nestjs/common';
import { SpeakingTutorController } from './speaking-tutor.controller';
import { SpeakingTutorService } from './speaking-tutor.service';
import { SkillLogsModule } from '../skill-logs/skill-logs.module';
import { TtsModule } from '../tts/tts.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, SkillLogsModule, TtsModule],
  controllers: [SpeakingTutorController],
  providers: [SpeakingTutorService],
  exports: [SpeakingTutorService],
})
export class SpeakingTutorModule {}
