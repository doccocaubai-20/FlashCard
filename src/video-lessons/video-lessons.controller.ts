import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import { VideoLessonsService } from './video-lessons.service';
import * as jwt from 'jsonwebtoken';

@Controller('api/video-lessons')
export class VideoLessonsController {
  constructor(private readonly videoLessonsService: VideoLessonsService) {}

  // 1. Get all video lessons metadata (public)
  @Get()
  async findAll() {
    return this.videoLessonsService.findAll();
  }

  // 2. Get single full video lesson detail with segments (public)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.videoLessonsService.findOne(id);
  }

  // 3. Contribute a new video lesson
  @Post()
  async create(@Body() body: any, @Req() req: any) {
    // Try to extract user if authorization header exists
    let user: any = null;
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET || 'secretKey';
        user = jwt.verify(token, secret);
      }
    } catch (e) {
      // Invalid or expired token, proceed as anonymous
    }

    return this.videoLessonsService.create(body, user);
  }

  // 4. Delete a contributed video lesson
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    let user: any = null;
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET || 'secretKey';
        user = jwt.verify(token, secret);
      }
    } catch (e) {}

    return this.videoLessonsService.remove(id, user);
  }
}
