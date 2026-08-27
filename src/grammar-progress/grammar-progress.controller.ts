import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GrammarProgressService } from './grammar-progress.service';

@Controller('api/grammar-progress')
@UseGuards(AuthGuard('jwt'))
export class GrammarProgressController {
  constructor(private readonly grammarProgressService: GrammarProgressService) {}

  @Post()
  upsert(@Req() req: any, @Body() body: any) {
    return this.grammarProgressService.upsert(req.user.id, body);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.grammarProgressService.findAll(req.user.id);
  }
}
