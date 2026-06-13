import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';

@Controller('api/chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  getHistory(@Req() req: any) {
    return this.chatService.getHistory(req.user.id);
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } }) // Giới hạn tối đa 15 tin nhắn/phút
  @Post()
  sendMessage(
    @Req() req: any,
    @Body() body: { message: string },
  ) {
    if (!body || typeof body.message !== 'string') {
      throw new HttpException(
        'Nội dung tin nhắn không hợp lệ.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.chatService.sendMessage(req.user.id, body.message);
  }

  @Delete()
  clearHistory(@Req() req: any) {
    return this.chatService.clearHistory(req.user.id);
  }
}
