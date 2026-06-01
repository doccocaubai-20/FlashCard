import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { DecksModule } from './decks/decks.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
@Module({
  imports: [PrismaModule, DecksModule, UsersModule, AuthModule, FlashcardsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
