import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  SpeakingTutorService,
  EvaluatePronunciationDto,
  ConversationTurnDto,
  MonologueDto,
} from './speaking-tutor.service';

@Controller('api/speaking-tutor')
export class SpeakingTutorController {
  constructor(private readonly speakingTutorService: SpeakingTutorService) {}

  /**
   * GET /api/speaking-tutor/scenarios
   * Returns list of dialogue scenarios for voice roleplay
   */
  @Get('scenarios')
  getScenarios() {
    return this.speakingTutorService.getScenarios();
  }

  /**
   * POST /api/speaking-tutor/evaluate-pronunciation
   * Evaluates student audio pronunciation against target sentence
   */
  @Post('evaluate-pronunciation')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async evaluatePronunciation(@Req() req: any, @Body() dto: EvaluatePronunciationDto) {
    return this.speakingTutorService.evaluatePronunciation(req.user.id, dto);
  }

  /**
   * POST /api/speaking-tutor/conversation-turn
   * Turn-by-turn roleplay conversation with audio reply
   */
  @Post('conversation-turn')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async handleConversationTurn(@Req() req: any, @Body() dto: ConversationTurnDto) {
    return this.speakingTutorService.handleConversationTurn(req.user.id, dto);
  }

  /**
   * POST /api/speaking-tutor/analyze-monologue
   * Freestyle speech analysis and native rephrasing
   */
  @Post('analyze-monologue')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async analyzeMonologue(@Req() req: any, @Body() dto: MonologueDto) {
    return this.speakingTutorService.analyzeMonologue(req.user.id, dto);
  }

  /**
   * POST /api/speaking-tutor/synthesize-speech
   * Generate native speech audio for any Chinese text
   */
  @Post('synthesize-speech')
  @HttpCode(HttpStatus.OK)
  async synthesizeSpeech(@Body('text') text: string) {
    const audioDataUri = await this.speakingTutorService.synthesizeSpeech(text);
    return { audioDataUri };
  }
}
