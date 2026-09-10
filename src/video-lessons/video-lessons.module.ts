import { Module } from '@nestjs/common';
import { VideoLessonsController } from './video-lessons.controller';
import { VideoLessonsService } from './video-lessons.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VideoLessonsController],
  providers: [VideoLessonsService],
  exports: [VideoLessonsService],
})
export class VideoLessonsModule {}
