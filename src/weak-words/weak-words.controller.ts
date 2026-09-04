import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WeakWordsService } from './weak-words.service';

@Controller('api/weak-words')
@UseGuards(AuthGuard('jwt'))
export class WeakWordsController {
  constructor(private readonly weakWordsService: WeakWordsService) {}

  @Post()
  upsert(@Req() req: any, @Body() body: any) {
    return this.weakWordsService.upsert(req.user.id, body);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.weakWordsService.findAll(req.user.id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.weakWordsService.remove(parseInt(id, 10), req.user.id);
  }
}
