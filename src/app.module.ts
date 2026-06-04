import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    DecksModule,
    UsersModule,
    AuthModule,
    FlashcardsModule,
    StudyModule,
    StatsModule,
    DictionaryHistoryModule,
    FavoriteWordModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
