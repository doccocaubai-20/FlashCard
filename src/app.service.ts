import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async onModuleInit() {
    // Run initial cleanup on startup
    this.cleanupOldLogs();

    // Schedule cleanup to run every 24 hours (24 * 60 * 60 * 1000 ms)
    setInterval(() => {
      this.cleanupOldLogs();
    }, 86400000);
  }

  private async cleanupOldLogs() {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Clean up UserSkillLog older than 90 days
      const skillLogResult = await this.prisma.userSkillLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      // Clean up GameRecord older than 90 days
      const gameRecordResult = await this.prisma.gameRecord.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      if (skillLogResult.count > 0 || gameRecordResult.count > 0) {
        console.log(
          `[AppService] Auto-cleanup completed. Deleted ${skillLogResult.count} skill logs and ${gameRecordResult.count} game records older than 90 days.`,
        );
      }
    } catch (error) {
      console.error('[AppService] Auto-cleanup failed:', error);
    }
  }
}
