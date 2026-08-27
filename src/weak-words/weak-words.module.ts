import { Module } from '@nestjs/common';
import { WeakWordsService } from './weak-words.service';
import { WeakWordsController } from './weak-words.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WeakWordsController],
  providers: [WeakWordsService],
  exports: [WeakWordsService],
})
export class WeakWordsModule {}
