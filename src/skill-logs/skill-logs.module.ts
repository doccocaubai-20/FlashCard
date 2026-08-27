import { Module } from '@nestjs/common';
import { SkillLogsService } from './skill-logs.service';
import { SkillLogsController } from './skill-logs.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SkillLogsController],
  providers: [SkillLogsService],
  exports: [SkillLogsService],
})
export class SkillLogsModule {}
