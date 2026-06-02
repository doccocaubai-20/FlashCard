import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Database from dictionary.json...');

  // 1. Create or Find system decks
  const decksData = [
    { level: 1, title: 'Từ vựng HSK 1 (Hệ thống)', description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 1 được lấy từ từ điển.' },
    { level: 2, title: 'Từ vựng HSK 2 (Hệ thống)', description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 2 được lấy từ từ điển.' },
    { level: 3, title: 'Từ vựng HSK 3 (Hệ thống)', description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 3 được lấy từ từ điển.' }
  ];

  const decksMap = new Map<number, number>(); // level -> deckId

  for (const d of decksData) {
    let deck = await prisma.deck.findFirst({
      where: { title: d.title, isSystem: true }
    });
    if (!deck) {
      deck = await prisma.deck.create({
        data: {
          title: d.title,
          description: d.description,
          isSystem: true
        }
      });
      console.log('Created system deck:', deck.title);
    } else {
      console.log('Found existing system deck:', deck.title);
    }
    decksMap.set(d.level, deck.id);
  }

  // 2. Read and Parse dictionary.json from frontend directory
  const dictPath = path.join(__dirname, '../../flashcard-frontend/src/data/dictionary.json');
  console.log('Reading dictionary from:', dictPath);
  
  if (!fs.existsSync(dictPath)) {
    throw new Error(`Dictionary file not found at ${dictPath}`);
  }

  const rawData = fs.readFileSync(dictPath, 'utf8');
  const dictionary = JSON.parse(rawData);

  if (!Array.isArray(dictionary)) {
    throw new Error('dictionary.json must be a JSON array of words');
  }

  // 3. Clear existing cards in these system decks to avoid duplicate constraints
  const deckIds = Array.from(decksMap.values());
  console.log('Clearing old system flashcards...');
  await prisma.flashcard.deleteMany({
    where: {
      deckId: { in: deckIds }
    }
  });

  // 4. Map HSK entries to database cards
  const cardsToInsert: any[] = [];
  for (const entry of dictionary) {
    if (!entry) continue;
    
    // Skip entries containing Latin letters (slang or informal words like B超, A片, C位, etc.)
    if (/[a-zA-Z]/.test(entry.s || '')) {
      continue;
    }

    const hskLevel = Number(entry.hsk);
    if (hskLevel === 1 || hskLevel === 2 || hskLevel === 3) {
      const deckId = decksMap.get(hskLevel);
      if (deckId) {
        cardsToInsert.push({
          deckId,
          hanzi: entry.s || '',
          pinyin: entry.p || '',
          meaning: entry.vi || '',
          radicals: entry.sv || '', // Save Sino-Vietnamese / Hán Việt as radicals
        });
      }
    }
  }

  console.log(`Found ${cardsToInsert.length} matching HSK 1-3 cards in dictionary.`);

  // 5. Bulk Seeding into the database
  console.log('Seeding HSK cards into database...');
  const result = await prisma.flashcard.createMany({
    data: cardsToInsert,
    skipDuplicates: true
  });

  console.log(`Successfully seeded ${result.count} new HSK cards into system decks!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
