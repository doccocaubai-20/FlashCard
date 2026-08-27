import { Module } from '@nestjs/common';
import { GrammarProgressService } from './grammar-progress.service';
import { GrammarProgressController } from './grammar-progress.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GrammarProgressController],
  providers: [GrammarProgressService],
  exports: [GrammarProgressService],
})
export class GrammarProgressModule {}
