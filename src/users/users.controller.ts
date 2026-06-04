import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { AuthGuard } from "@nestjs/passport";

@Controller('api/users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('me')
  getMe(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.findById(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền truy cập thông tin của người dùng khác!');
    }
    return this.usersService.findById(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() updateUserDto: UpdateUserDto) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa thông tin của người dùng khác!');
    }
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa tài khoản của người dùng khác!');
    }
    return this.usersService.remove(+id);
  }
}
