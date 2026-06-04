import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Load dictionary.json for Hán Việt (Sino-Vietnamese) lookup enrichment
const dictPath = path.join(__dirname, '../../flashcard-frontend/src/data/dictionary.json');
const dictMap = new Map<string, any>();
if (fs.existsSync(dictPath)) {
  const rawDict = fs.readFileSync(dictPath, 'utf8');
  const dictionary = JSON.parse(rawDict);
  if (Array.isArray(dictionary)) {
    for (const entry of dictionary) {
      if (entry && entry.s) {
        dictMap.set(entry.s, entry);
      }
    }
  }
  console.log(`Loaded dictionary with ${dictMap.size} entries.`);
} else {
  console.log('Dictionary not found. Skipping Hán Việt lookup.');
}

// Helper to look up Sino-Vietnamese (sv) readings
function lookupSV(hanzi: string): string {
  // 1. Try exact match
  let entry = dictMap.get(hanzi);
  if (entry && entry.sv) return entry.sv;

  // 2. Try match for variants split by vertical bar
  if (hanzi.includes('｜') || hanzi.includes('|')) {
    const parts = hanzi.split(/[｜|]/);
    for (const part of parts) {
      entry = dictMap.get(part.trim());
      if (entry && entry.sv) return entry.sv;
    }
  }

  // 3. Character-by-character lookup and synthesis
  const chars = Array.from(hanzi.replace(/[｜|]/g, ''));
  const svParts: string[] = [];
  for (const c of chars) {
    const matched = dictMap.get(c);
    if (matched && matched.sv) {
      svParts.push(matched.sv);
    }
  }
  if (svParts.length > 0) {
    return svParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

async function main() {
  console.log('Seeding Database...');

  // 1. Delete all old system flashcards
  console.log('Deleting all old system flashcards...');
  await prisma.flashcard.deleteMany({
    where: {
      deck: { isSystem: true }
    }
  });

  // 2. Delete all old system decks
  console.log('Deleting all old system decks...');
  await prisma.deck.deleteMany({
    where: { isSystem: true }
  });

  // 3. Define decks to seed
  const decksToSeed = [
    {
      title: 'Từ vựng HSK 1 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 1 được đồng bộ từ file tu_vung_hsk1.json.',
      fileName: 'tu_vung_hsk1.json',
    },
    {
      title: 'Từ vựng HSK 2 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 2 được đồng bộ từ file tu_vung_hsk2.json.',
      fileName: 'tu_vung_hsk2.json',
    }
  ];

  // 4. Loop through each deck config and seed
  for (const deckConfig of decksToSeed) {
    console.log(`\nCreating deck: ${deckConfig.title}...`);
    const deck = await prisma.deck.create({
      data: {
        title: deckConfig.title,
        description: deckConfig.description,
        isSystem: true
      }
    });
    console.log('Created deck:', deck.title);

    const jsonPath = path.join(__dirname, `../../flashcard-frontend/src/data/${deckConfig.fileName}`);
    console.log('Reading vocabulary from:', jsonPath);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Vocabulary file not found at ${jsonPath}`);
    }

    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const vocabList = JSON.parse(rawData);

    if (!Array.isArray(vocabList)) {
      throw new Error(`${deckConfig.fileName} must be a JSON array`);
    }

    const cardsToInsert: any[] = [];
    for (const item of vocabList) {
      if (!item) continue;

      const rawHanzi = item['Tiếng Trung'] || '';
      const rawPinyin = item['Pinyin'] || '';
      const rawMeaning = item['Dịch nghĩa'] || '';

      const hanzi = rawHanzi.trim();
      const pinyin = rawPinyin.replace(/\r/g, '').replace(/\n+/g, ' ').trim();
      const meaning = rawMeaning.trim();

      const sv = lookupSV(hanzi);

      cardsToInsert.push({
        deckId: deck.id,
        hanzi,
        pinyin,
        meaning,
        radicals: sv || null,
        exampleHanzi: item.exampleHanzi || null,
        examplePinyin: item.examplePinyin || null,
        exampleMeaning: item.exampleMeaning || null,
      });
    }

    console.log(`Found ${cardsToInsert.length} vocabulary entries in ${deckConfig.fileName}.`);
    console.log(`Inserting flashcards for ${deckConfig.title}...`);

    const result = await prisma.flashcard.createMany({
      data: cardsToInsert,
      skipDuplicates: true
    });

    console.log(`Successfully seeded ${result.count} cards for ${deckConfig.title}!`);
  }

  console.log('\nAll decks seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
