import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { TtsService } from './tts.service';

@Controller('api/tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  /**
   * GET /api/tts/speak?text=你好&lang=zh-CN&gender=female
   * Returns audio/mpeg binary stream.
   */
  @Get('speak')
  async speakGet(
    @Query('text') text: string,
    @Query('lang') lang: string = 'zh-CN',
    @Query('gender') gender: string = 'female',
    @Res() res: Response,
  ) {
    return this.handleSpeak(text, lang, gender, res);
  }

  /**
   * POST /api/tts/speak
   * Body: { text: "你好", lang: "zh-CN", gender: "female" }
   * Returns audio/mpeg binary stream.
   */
  @Post('speak')
  async speakPost(
    @Body('text') text: string,
    @Body('lang') lang: string = 'zh-CN',
    @Body('gender') gender: string = 'female',
    @Res() res: Response,
  ) {
    return this.handleSpeak(text, lang, gender, res);
  }

  private async handleSpeak(
    text: string,
    lang: string,
    gender: string,
    res: Response,
  ) {
    if (!text || text.trim().length === 0) {
      throw new HttpException(
        'Parameter "text" is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const isCached = this.ttsService.isCached(text, lang, gender);

      if (isCached) {
        // Serve immediately from cache
        const audioBuffer = await this.ttsService.generateSpeech(
          text,
          lang,
          gender,
        );
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'public, max-age=86400', // Cache 24h on browser
          'Access-Control-Allow-Origin': '*',
        });
        res.send(audioBuffer);
        return;
      }

      const audioBuffer = await this.ttsService.generateSpeech(
        text,
        lang,
        gender,
      );
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(audioBuffer);
    } catch (error) {
      if (!res.headersSent) {
        throw new HttpException(
          `TTS generation failed: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else {
        res.end();
      }
    }
  }
}
