import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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

  // ═══════════════════════════════════════════════════════════════
  // 1. TOKEN QUOTA & REFILL ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  @Get('quota')
  getQuota(@Req() req: any) {
    return this.chatService.getQuotaStatus(req.user.id);
  }

  @Post('refill-quota')
  refillQuota(@Req() req: any) {
    return this.chatService.refillTokensWithCoins(req.user.id);
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. CHAT SESSIONS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  @Get('sessions')
  getSessions(@Req() req: any) {
    return this.chatService.getSessions(req.user.id);
  }

  @Post('sessions')
  createSession(
    @Req() req: any,
    @Body() body: { title?: string; persona?: string; deckId?: number },
  ) {
    return this.chatService.createSession(req.user.id, body);
  }

  @Patch('sessions/:id')
  updateSession(
    @Req() req: any,
    @Param('id') sessionId: string,
    @Body() body: { title?: string; pinned?: boolean; persona?: string; deckId?: number },
  ) {
    return this.chatService.updateSession(req.user.id, sessionId, body);
  }

  @Delete('sessions/:id')
  deleteSession(@Req() req: any, @Param('id') sessionId: string) {
    return this.chatService.deleteSession(req.user.id, sessionId);
  }

  @Get('sessions/:id/messages')
  getSessionMessages(@Req() req: any, @Param('id') sessionId: string) {
    return this.chatService.getSessionMessages(req.user.id, sessionId);
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. CORE MESSAGING & BACKWARD COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════

  @Get()
  getHistory(@Req() req: any) {
    return this.chatService.getHistory(req.user.id);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 messages / phút
  @Post()
  sendMessage(
    @Req() req: any,
    @Body()
    body: {
      message: string;
      sessionId?: string;
      persona?: string;
      deckId?: number;
    },
  ) {
    if (!body || typeof body.message !== 'string') {
      throw new HttpException(
        'Nội dung tin nhắn không hợp lệ.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.chatService.sendMessage(req.user.id, body.message, {
      sessionId: body.sessionId,
      persona: body.persona,
      deckId: body.deckId,
    });
  }

  @Delete()
  clearHistory(@Req() req: any) {
    return this.chatService.clearHistory(req.user.id);
  }
}
