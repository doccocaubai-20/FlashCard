import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { DecksService } from './decks.service';
import { Prisma } from '@prisma/client';
import { AuthGuard } from "@nestjs/passport";
import { CreateDeckDto } from './dto/create-deck.dto';
import { SetMetadata } from '@nestjs/common';
import { RolesGuard } from 'src/auth/guards/roles.guard';
@Controller('api/decks')
export class DecksController {
  constructor(private readonly decksService: DecksService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() createDeckDto: CreateDeckDto, @Req() req: any) {
    return this.decksService.create(req.user.id, createDeckDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any) {
    return this.decksService.findAllUserDecks(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.decksService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDeckDto: Prisma.DeckUpdateInput) {
    return this.decksService.update(+id, updateDeckDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const currentUserId = req.user.id;
    return this.decksService.remove(+id, currentUserId, req.user.role);
  }
  @Delete('system/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @SetMetadata('roles', ['ADMIN'])
  removeSystemDeck(@Param('id', ParseIntPipe) id: number) {
    return this.decksService.removeSystemDeck(id);
  }
}
