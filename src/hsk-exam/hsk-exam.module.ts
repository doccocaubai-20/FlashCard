import { Module } from '@nestjs/common';
import { HskExamService } from './hsk-exam.service';
import { HskExamController } from './hsk-exam.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HskExamController],
  providers: [HskExamService],
  exports: [HskExamService],
})
export class HskExamModule {}
