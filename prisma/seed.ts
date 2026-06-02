import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Create a system deck if it doesn't exist
  let systemDeck = await prisma.deck.findFirst({
    where: { isSystem: true },
  });

  if (!systemDeck) {
    systemDeck = await prisma.deck.create({
      data: {
        title: 'Tiếng Trung Cơ Bản (Hệ Thống)',
        description: 'Bộ thẻ từ vựng giao tiếp tiếng Trung cơ bản dành cho người mới bắt đầu.',
        isSystem: true,
      },
    });
    console.log('Created system deck:', systemDeck.title);
  }

  // 2. Add some Chinese flashcards to the system deck
  const flashcards = [
    {
      hanzi: '你',
      pinyin: 'nǐ',
      meaning: 'bạn, anh, chị (ngôi thứ 2 số ít)',
      radicals: '亻(nhân)',
      exampleHanzi: '你好',
      examplePinyin: 'nǐ hǎo',
      exampleMeaning: 'Xin chào',
    },
    {
      hanzi: '好',
      pinyin: 'hǎo',
      meaning: 'tốt, đẹp, khỏe, ngon',
      radicals: '女(nữ), 子(tử)',
      exampleHanzi: '你好吗？',
      examplePinyin: 'nǐ hǎo ma?',
      exampleMeaning: 'Bạn khỏe không?',
    },
    {
      hanzi: '谢谢',
      pinyin: 'xièxie',
      meaning: 'cảm ơn',
      radicals: '言(ngôn)',
      exampleHanzi: '谢谢你的 giúp đỡ.',
      examplePinyin: 'xièxie nǐ de giúp đỡ.',
      exampleMeaning: 'Cảm ơn sự giúp đỡ của bạn.',
    },
    {
      hanzi: '再见',
      pinyin: 'zàijiàn',
      meaning: 'tạm biệt, hẹn gặp lại',
      radicals: '冂(quynh), 见(kiến)',
      exampleHanzi: '老师，再见！',
      examplePinyin: 'lǎoshī, zàijiàn!',
      exampleMeaning: 'Chào thầy/cô, tạm biệt!',
    },
    {
      hanzi: '水',
      pinyin: 'shuǐ',
      meaning: 'nước',
      radicals: '水(thủy)',
      exampleHanzi: '我想喝水。',
      examplePinyin: 'wǒ xiǎng hē shuǐ.',
      exampleMeaning: 'Tôi muốn uống nước.',
    },
  ];

  for (const card of flashcards) {
    await prisma.flashcard.upsert({
      where: {
        deckId_hanzi_meaning: {
          deckId: systemDeck.id,
          hanzi: card.hanzi,
          meaning: card.meaning,
        },
      },
      update: {},
      create: {
        ...card,
        deckId: systemDeck.id,
      },
    });
  }

  console.log(`Seeded ${flashcards.length} flashcards.`);
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
