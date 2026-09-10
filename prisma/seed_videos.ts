import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== BẮT ĐẦU SEED DỮ LIỆU VIDEO BÀI HỌC VÀO DATABASE ===\n');

  const isLocal =
    process.env.DATABASE_URL?.includes('localhost') ||
    process.env.DATABASE_URL?.includes('127.0.0.1');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Đường dẫn tới thư mục data/video-lessons
  const candidates = [
    path.resolve(process.cwd(), 'data/video-lessons'),
    path.resolve(__dirname, '../data/video-lessons'),
    path.resolve(__dirname, '../../data/video-lessons'),
  ];
  let dataDir = candidates[0];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dataDir = p;
      break;
    }
  }

  if (!fs.existsSync(dataDir)) {
    console.error(`Không tìm thấy thư mục: ${dataDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`Tìm thấy ${files.length} file video JSON trong ${dataDir}.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(dataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      const id = String(data.id || data.youtubeId || path.basename(file, '.json')).trim();
      const youtubeId = String(data.youtubeId || id).trim();
      const segments = Array.isArray(data.segments) ? data.segments : [];
      const segmentsCount = segments.length;
      const lastSegEnd = segmentsCount > 0 ? segments[segmentsCount - 1].end : 0;
      const durationSec =
        data.durationSec != null
          ? Number(data.durationSec)
          : Math.ceil(lastSegEnd);

      const title = data.title || 'Video bài học';
      const titleHanzi = data.titleHanzi ? String(data.titleHanzi).trim() : null;
      const level = data.level != null && !isNaN(Number(data.level)) ? Number(data.level) : null;
      const topic = data.topic ? String(data.topic).trim() : 'Khác';
      const channel = data.channel ? String(data.channel).trim() : 'YouTube';
      const thumbnailUrl =
        data.thumbnailUrl ||
        `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
      const isSystem = data.isSystem !== undefined ? !!data.isSystem : true;
      const isCommunity = data.isCommunity !== undefined ? !!data.isCommunity : !isSystem;
      const contributorName = data.contributorName || (isSystem ? 'Hệ thống' : 'Cộng đồng');

      await prisma.videoLesson.upsert({
        where: { id },
        update: {
          youtubeId,
          title,
          titleHanzi,
          level,
          topic,
          channel,
          durationSec,
          thumbnailUrl,
          totalSentences: segmentsCount,
          segments,
          isSystem,
          isCommunity,
          contributorName,
        },
        create: {
          id,
          youtubeId,
          title,
          titleHanzi,
          level,
          topic,
          channel,
          durationSec,
          thumbnailUrl,
          totalSentences: segmentsCount,
          segments,
          isSystem,
          isCommunity,
          contributorName,
        },
      });

      successCount++;
      console.log(`[${i + 1}/${files.length}] ✓ Đã seed: "${title}" (HSK ${level || '?'}, ${segmentsCount} câu)`);
    } catch (err) {
      errorCount++;
      console.error(`[${i + 1}/${files.length}] ✗ Lỗi seed file ${file}:`, err.message);
    }
  }

  console.log('\n=============================================');
  console.log(`HOÀN THÀNH SEED VIDEO VÀO DATABASE!`);
  console.log(`- Thành công: ${successCount} video`);
  console.log(`- Thất bại: ${errorCount} video`);
  console.log('=============================================\n');

  await pool.end();
}

main().catch((err) => {
  console.error('Lỗi thực thi seed:', err);
  process.exit(1);
});
