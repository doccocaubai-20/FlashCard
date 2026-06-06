import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  HttpException,
  HttpStatus,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { createClient } from '@supabase/supabase-js';
import * as multer from 'multer';

// Store files in memory (as Buffer) for Supabase upload
const memStorage = multer.memoryStorage();

@Controller('api/users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập thông tin của người dùng khác!',
      );
    }
    return this.usersService.findById(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa thông tin của người dùng khác!',
      );
    }
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== +id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Bạn không có quyền xóa tài khoản của người dùng khác!',
      );
    }
    return this.usersService.remove(+id);
  }

  @Post('upload-avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memStorage }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new HttpException(
        'Không có file nào được gửi lên!',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new HttpException(
        'Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF!',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      throw new HttpException(
        'Ảnh không được vượt quá 2MB!',
        HttpStatus.BAD_REQUEST,
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new HttpException(
        'Supabase chưa được cấu hình trên server!',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const userId = req.user.id;
    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `avatars/${userId}_${Date.now()}.${ext}`;

    // Upload to Supabase Storage bucket 'avatars'
    const { error } = await supabase.storage
      .from('avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      throw new HttpException(
        'Lỗi upload ảnh: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);
    const avatarUrl = urlData.publicUrl;

    // Save URL to user record
    await this.usersService.update(userId, { avatarUrl });

    return { avatarUrl };
  }
}
