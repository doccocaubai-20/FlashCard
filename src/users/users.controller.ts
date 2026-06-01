import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { AuthGuard } from "@nestjs/passport";
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.findById(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }

}
