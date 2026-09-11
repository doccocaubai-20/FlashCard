import { Module } from '@nestjs/common';
import { ReadingPassagesService } from './reading-passages.service';
import { ReadingPassagesController } from './reading-passages.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReadingPassagesController],
  providers: [ReadingPassagesService],
  exports: [ReadingPassagesService],
})
export class ReadingPassagesModule {}
