import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { DecksModule } from './decks/decks.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { StudyModule } from './study/study.module';
import { StatsModule } from './stats/stats.module';
import { DictionaryHistoryModule } from './dictionary-history/dictionary-history.module';
import { FavoriteWordModule } from './favorite-words/favoriteWord.module';
import { DictionaryModule } from './dictionary/dictionary.module';
import { AdminModule } from './admin/admin.module';
import { SocialModule } from './social/social.module';
import { ChatModule } from './chat/chat.module';
import { HskExamModule } from './hsk-exam/hsk-exam.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    PrismaModule,
    DecksModule,
    UsersModule,
    AuthModule,
    FlashcardsModule,
    StudyModule,
    StatsModule,
    DictionaryHistoryModule,
    FavoriteWordModule,
    DictionaryModule,
    AdminModule,
    SocialModule,
    ChatModule,
    HskExamModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
