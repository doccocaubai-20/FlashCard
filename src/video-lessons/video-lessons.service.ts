import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface VideoLessonMeta {
  id: string;
  youtubeId: string;
  title: string;
  titleHanzi?: string | null;
  level?: number | null;
  topic?: string | null;
  channel?: string | null;
  durationSec?: number | null;
  thumbnailUrl?: string | null;
  totalSentences?: number | null;
  isSystem?: boolean;
  isCommunity?: boolean;
  contributorName?: string | null;
  contributorId?: number | null;
  createdAt?: string | null;
}

export interface VideoLessonSegment {
  id: number;
  start: number;
  end: number;
  hanzi: string;
  pinyin?: string;
  vi?: string;
}

export interface VideoLessonDetail extends VideoLessonMeta {
  segments: VideoLessonSegment[];
}

@Injectable()
export class VideoLessonsService {
  private readonly logger = new Logger(VideoLessonsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getDataDir(): string {
    const candidates = [
      path.resolve(process.cwd(), 'data/video-lessons'),
      path.resolve(__dirname, '../../data/video-lessons'),
      path.resolve(__dirname, '../../../data/video-lessons'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    const defaultPath = candidates[0];
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }
    return defaultPath;
  }

  // Helper to extract YouTube Video ID if a full URL was provided
  private extractYoutubeId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('.')) {
      return trimmed;
    }
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = trimmed.match(regExp);
    return match ? match[1] : trimmed;
  }

  // 1. Get all video lessons metadata (reads from DB first, falls back to JSON files)
  async findAll(): Promise<VideoLessonMeta[]> {
    // 1. Try fetching from Database
    try {
      const dbList = await this.prisma.videoLesson.findMany({
        select: {
          id: true,
          youtubeId: true,
          title: true,
          titleHanzi: true,
          level: true,
          topic: true,
          channel: true,
          durationSec: true,
          thumbnailUrl: true,
          totalSentences: true,
          isSystem: true,
          isCommunity: true,
          contributorName: true,
          contributorId: true,
          createdAt: true,
        },
        orderBy: [
          { isCommunity: 'desc' },
          { createdAt: 'desc' },
          { level: 'asc' },
        ],
      });

      if (dbList && dbList.length > 0) {
        return dbList.map((item) => ({
          ...item,
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        }));
      }
    } catch (err) {
      this.logger.warn(`Prisma query failed, falling back to JSON files: ${err.message}`);
    }

    // 2. Fallback: Read JSON files from data/video-lessons
    const dataDir = this.getDataDir();
    if (!fs.existsSync(dataDir)) return [];

    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    const list: VideoLessonMeta[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const d = JSON.parse(content);

        const id = d.id || d.youtubeId || path.basename(file, '.json');
        const youtubeId = d.youtubeId || id;
        const segmentsCount = Array.isArray(d.segments) ? d.segments.length : 0;
        const lastSegEnd = segmentsCount > 0 ? d.segments[segmentsCount - 1].end : 0;

        list.push({
          id,
          youtubeId,
          title: d.title || 'Video bài học',
          titleHanzi: d.titleHanzi || null,
          level: d.level != null ? Number(d.level) : null,
          topic: d.topic || 'Khác',
          channel: d.channel || 'YouTube',
          durationSec: d.durationSec != null ? Number(d.durationSec) : Math.ceil(lastSegEnd),
          thumbnailUrl:
            d.thumbnailUrl ||
            `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
          totalSentences: d.totalSentences != null ? Number(d.totalSentences) : segmentsCount,
          isSystem: !!d.isSystem,
          isCommunity: d.isCommunity !== undefined ? !!d.isCommunity : !d.isSystem,
          contributorName: d.contributorName || (d.isSystem ? 'Hệ thống' : 'Cộng đồng'),
          contributorId: d.contributorId || null,
          createdAt: d.createdAt || null,
        });
      } catch (err) {
        this.logger.error(`Error reading ${file}: ${err.message}`);
      }
    }

    return list.sort((a, b) => {
      if (a.isCommunity && !b.isCommunity) return -1;
      if (!a.isCommunity && b.isCommunity) return 1;
      if (a.isCommunity && b.isCommunity) {
        return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
      }
      return (a.level || 99) - (b.level || 99);
    });
  }

  // 2. Get single full video lesson detail with segments (DB first, fallback to JSON)
  async findOne(id: string): Promise<VideoLessonDetail> {
    const cleanId = id.trim();

    // 1. Try DB first
    try {
      const found = await this.prisma.videoLesson.findFirst({
        where: {
          OR: [{ id: cleanId }, { youtubeId: cleanId }],
        },
      });

      if (found) {
        return {
          ...found,
          createdAt: found.createdAt ? found.createdAt.toISOString() : null,
          segments: found.segments as any,
        };
      }
    } catch (err) {
      this.logger.warn(`Prisma findOne failed, falling back to JSON: ${err.message}`);
    }

    // 2. Fallback: Search in JSON files
    const dataDir = this.getDataDir();
    const exactPath = path.join(dataDir, `${cleanId}.json`);
    if (fs.existsSync(exactPath)) {
      try {
        const content = fs.readFileSync(exactPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        this.logger.error(`Failed to parse ${exactPath}: ${e.message}`);
      }
    }

    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const p = path.join(dataDir, file);
        const content = fs.readFileSync(p, 'utf8');
        const d = JSON.parse(content);
        if (d.id === cleanId || d.youtubeId === cleanId) {
          return d;
        }
      } catch (e) {}
    }

    throw new NotFoundException(`Không tìm thấy bài học video "${id}"`);
  }

  // 3. Create/contribute a new video lesson (saves to DB and writes JSON backup)
  async create(payload: any, user?: any): Promise<VideoLessonDetail> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Dữ liệu JSON không hợp lệ');
    }

    const rawYoutubeId = payload.youtubeId || payload.id;
    const youtubeId = this.extractYoutubeId(rawYoutubeId);
    if (!youtubeId || youtubeId.length !== 11) {
      throw new BadRequestException('Mã hoặc đường dẫn YouTube không hợp lệ (cần 11 ký tự)');
    }

    if (!payload.title || typeof payload.title !== 'string') {
      throw new BadRequestException('Tiêu đề video không được để trống');
    }

    if (!Array.isArray(payload.segments) || payload.segments.length === 0) {
      throw new BadRequestException('Danh sách câu phụ đề (segments) phải có ít nhất 1 câu');
    }

    // Sanitize segments
    const cleanSegments: VideoLessonSegment[] = payload.segments.map((s: any, idx: number) => {
      const start = typeof s.start === 'number' ? s.start : parseFloat(s.start) || 0;
      const end = typeof s.end === 'number' ? s.end : parseFloat(s.end) || start + 2;
      return {
        id: s.id != null ? Number(s.id) : idx + 1,
        start: Math.max(0, start),
        end: Math.max(start, end),
        hanzi: String(s.hanzi || '').trim(),
        pinyin: s.pinyin ? String(s.pinyin).trim() : '',
        vi: s.vi ? String(s.vi).trim() : '',
      };
    });

    const segmentsCount = cleanSegments.length;
    const lastSegEnd = cleanSegments[segmentsCount - 1].end;
    const durationSec =
      payload.durationSec != null
        ? Number(payload.durationSec)
        : Math.ceil(lastSegEnd);

    // Generate unique ID
    const fileId = payload.id && typeof payload.id === 'string' && payload.id.length > 3
      ? payload.id.replace(/[^a-zA-Z0-9_-]/g, '')
      : `c-${youtubeId}-${Date.now()}`;

    const newLesson: VideoLessonDetail = {
      id: fileId,
      youtubeId,
      title: payload.title.trim(),
      titleHanzi: payload.titleHanzi ? payload.titleHanzi.trim() : null,
      level: payload.level != null && !isNaN(Number(payload.level)) ? Number(payload.level) : null,
      topic: payload.topic ? payload.topic.trim() : 'Cộng đồng',
      channel: payload.channel ? payload.channel.trim() : 'YouTube',
      durationSec,
      thumbnailUrl:
        payload.thumbnailUrl ||
        `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
      totalSentences: segmentsCount,
      isSystem: false,
      isCommunity: true,
      contributorName: user?.name || payload.contributorName || 'Người dùng đóng góp',
      contributorId: user?.id || null,
      createdAt: new Date().toISOString(),
      segments: cleanSegments,
    };

    // 1. Save to Database
    try {
      await this.prisma.videoLesson.upsert({
        where: { id: fileId },
        update: {
          youtubeId,
          title: newLesson.title,
          titleHanzi: newLesson.titleHanzi,
          level: newLesson.level,
          topic: newLesson.topic,
          channel: newLesson.channel,
          durationSec: newLesson.durationSec,
          thumbnailUrl: newLesson.thumbnailUrl,
          totalSentences: newLesson.totalSentences,
          segments: cleanSegments as any,
          isSystem: false,
          isCommunity: true,
          contributorName: newLesson.contributorName,
          contributorId: newLesson.contributorId,
        },
        create: {
          id: fileId,
          youtubeId,
          title: newLesson.title,
          titleHanzi: newLesson.titleHanzi,
          level: newLesson.level,
          topic: newLesson.topic,
          channel: newLesson.channel,
          durationSec: newLesson.durationSec,
          thumbnailUrl: newLesson.thumbnailUrl,
          totalSentences: newLesson.totalSentences,
          segments: cleanSegments as any,
          isSystem: false,
          isCommunity: true,
          contributorName: newLesson.contributorName,
          contributorId: newLesson.contributorId,
        },
      });
      this.logger.log(`Persisted video ${fileId} to PostgreSQL database.`);
    } catch (dbErr) {
      this.logger.error(`Database insert error for ${fileId}: ${dbErr.message}`);
    }

    // 2. Write file JSON backup
    try {
      const dataDir = this.getDataDir();
      const targetFile = path.join(dataDir, `${fileId}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(newLesson, null, 2), 'utf8');
      this.logger.log(`Saved backup JSON file: ${targetFile}`);
    } catch (fsErr) {
      this.logger.error(`Backup JSON write error: ${fsErr.message}`);
    }

    return newLesson;
  }

  // 4. Delete video lesson
  async remove(id: string, user?: any): Promise<{ success: boolean; message: string }> {
    const cleanId = id.trim().replace(/[^a-zA-Z0-9_-]/g, '');

    // Check DB
    try {
      const found = await this.prisma.videoLesson.findUnique({ where: { id: cleanId } });
      if (found) {
        if (found.isSystem) {
          throw new BadRequestException('Không thể xóa bài học mặc định của hệ thống');
        }
        if (user && !['ADMIN', 'admin'].includes(user.role) && found.contributorId && found.contributorId !== user.id) {
          throw new BadRequestException('Bạn không có quyền xóa bài học này');
        }
        await this.prisma.videoLesson.delete({ where: { id: cleanId } });
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
    }

    // Remove from file if exists
    const dataDir = this.getDataDir();
    const filePath = path.join(dataDir, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }

    return { success: true, message: 'Đã xóa bài học thành công' };
  }
}
