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
  const wordToTopicIdMap = new Map<string, number>();

  // Clean up all existing system decks and cards to synchronize HSK 3.0
  console.log('Cleaning up existing system decks and flashcards to sync HSK 3.0...');
  await prisma.flashcard.deleteMany({
    where: { deck: { isSystem: true } }
  });
  await prisma.deck.deleteMany({
    where: { isSystem: true }
  });
  console.log('Cleaned up existing system decks.');

  // 3. Define decks to seed
  const decksToSeed = [
    {
      title: 'Từ vựng HSK 1 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 1 được đồng bộ từ file tu_vung_hsk1.json.',
      fileName: 'tu_vung_hsk1.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 2 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 2 được đồng bộ từ file tu_vung_hsk2.json.',
      fileName: 'tu_vung_hsk2.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 3 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 3 được đồng bộ từ file tu_vung_hsk3.json.',
      fileName: 'tu_vung_hsk3.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 4 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 4 được đồng bộ từ file tu_vung_hsk4.json.',
      fileName: 'tu_vung_hsk4.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 5 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 5 được đồng bộ từ file tu_vung_hsk5.json.',
      fileName: 'tu_vung_hsk5.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 6 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 6 được đồng bộ từ file tu_vung_hsk6.json.',
      fileName: 'tu_vung_hsk6.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng HSK 7-9 (Hệ thống)',
      description: 'Toàn bộ từ vựng chính thức HSK Cấp độ 7-9 được đồng bộ từ file tu_vung_hsk7_9.json.',
      fileName: 'tu_vung_hsk7_9.json',
      language: 'ZH'
    },
    {
      title: 'Từ vựng Oxford A1-A2 (Hệ thống)',
      description: '995 từ vựng Tiếng Anh cơ bản theo chuẩn Oxford A1-A2.',
      fileName: 'tu_vung_english_oxford_a1_a2.json',
      language: 'EN'
    },
    {
      title: 'Từ vựng IELTS Academic (Hệ thống)',
      description: '101 từ vựng học thuật cao cấp IELTS Academic.',
      fileName: 'tu_vung_english_ielts_academic.json',
      language: 'EN'
    },
    {
      title: 'Từ vựng TOEIC Business (Hệ thống)',
      description: '83 từ vựng chủ đề Kinh tế - Thương mại trong đề thi TOEIC.',
      fileName: 'tu_vung_english_toeic_business.json',
      language: 'EN'
    },
    {
      title: 'Lộ trình TOEIC 0-250 (Hệ thống)',
      description: 'Từ vựng TOEIC căn bản cho mục tiêu 0-250 điểm.',
      fileName: 'tu_vung_english_toeic_0_250.json',
      language: 'EN'
    },
    {
      title: 'Lộ trình TOEIC 250-500 (Hệ thống)',
      description: 'Từ vựng TOEIC sơ cấp cho mục tiêu 250-500 điểm.',
      fileName: 'tu_vung_english_toeic_250_500.json',
      language: 'EN'
    },
    {
      title: 'Lộ trình TOEIC 500-700 (Hệ thống)',
      description: 'Từ vựng TOEIC trung cấp cho mục tiêu 500-700 điểm.',
      fileName: 'tu_vung_english_toeic_500_700.json',
      language: 'EN'
    },
    {
      title: 'Lộ trình TOEIC 700-850 (Hệ thống)',
      description: 'Từ vựng TOEIC cận cao cấp cho mục tiêu 700-850 điểm.',
      fileName: 'tu_vung_english_toeic_700_850.json',
      language: 'EN'
    },
    {
      title: 'Lộ trình TOEIC 850-990 (Hệ thống)',
      description: 'Từ vựng TOEIC cao cấp cho mục tiêu 850-990 điểm.',
      fileName: 'tu_vung_english_toeic_850_990.json',
      language: 'EN'
    }
  ];

  // 4. Loop through each deck config and seed
  for (const deckConfig of decksToSeed) {
    console.log(`\nCreating deck: ${deckConfig.title}...`);
    const deck = await prisma.deck.create({
      data: {
        title: deckConfig.title,
        description: deckConfig.description,
        isSystem: true,
        language: deckConfig.language
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

      const rawHanzi = item['Tiếng Trung'] || item['Tiếng Anh'] || '';
      const rawPinyin = item['Pinyin'] || '';
      const rawMeaning = item['Dịch nghĩa'] || '';

      const hanzi = rawHanzi.trim();
      const pinyin = rawPinyin.replace(/\r/g, '').replace(/\n+/g, ' ').trim();
      const meaning = rawMeaning.trim();

      const sv = deckConfig.language === 'ZH' ? lookupSV(hanzi) : '';
      if (item.topicId) {
        wordToTopicIdMap.set(hanzi, Number(item.topicId));
      }

      cardsToInsert.push({
        deckId: deck.id,
        hanzi,
        pinyin,
        meaning,
        radicals: sv || null,
        exampleHanzi: item.exampleHanzi || null,
        examplePinyin: item.examplePinyin || null,
        exampleMeaning: item.exampleMeaning || null,
        topicId: item.topicId || null,
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

  // 5. Seed DictionaryWord
  console.log('Cleaning up existing dictionary words...');
  await prisma.dictionaryWord.deleteMany({});

  if (fs.existsSync(dictPath)) {
    console.log('\nSeeding DictionaryWord table...');
    const rawDict = fs.readFileSync(dictPath, 'utf8');
    const dictionary = JSON.parse(rawDict);
    if (Array.isArray(dictionary)) {
      const wordsToInsert: any[] = [];
      for (const entry of dictionary) {
        if (!entry || !entry.s) continue;
        const matchedTopicId = wordToTopicIdMap.get(entry.s);
        wordsToInsert.push({
          s: entry.s,
          t: entry.t || null,
          p: entry.p || null,
          pt: entry.pt || null,
          sp: entry.sp || null,
          b: entry.b ? Number(entry.b) : null,
          vi: entry.vi || null,
          sv: entry.sv || null,
          en: Array.isArray(entry.en) ? entry.en : entry.en ? [entry.en] : [],
          hsk: entry.hsk ? Number(entry.hsk) : null,
          topicId: matchedTopicId || null,
        });
      }
        
        console.log(`Preparing to seed ${wordsToInsert.length} dictionary words...`);
        const batchSize = 5000;
        let insertedCount = 0;
        for (let i = 0; i < wordsToInsert.length; i += batchSize) {
          const batch = wordsToInsert.slice(i, i + batchSize);
          const result = await prisma.dictionaryWord.createMany({
            data: batch,
            skipDuplicates: true
          });
          insertedCount += result.count;
          console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: +${result.count} words (total: ${insertedCount})`);
        }
        console.log(`Finished seeding DictionaryWord. Total inserted: ${insertedCount}`);
      }
    } else {
      console.log('\ndictionary.json not found. Skipping DictionaryWord seeding.');
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
