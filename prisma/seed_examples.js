const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 1. Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const isLocal =
  process.env.DATABASE_URL.includes('localhost') ||
  process.env.DATABASE_URL.includes('127.0.0.1');

// 2. Initialize PostgreSQL Pool and Prisma Adapter
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting example sentences seeding...');

  // 3. Path to opusSentences.json
  const jsonPath = path.join(__dirname, '../src/data/opusSentences.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: opusSentences.json not found at ${jsonPath}`);
    process.exit(1);
  }

  // 4. Read and parse JSON
  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const sentences = JSON.parse(rawData);
  console.log(`Loaded ${sentences.length} sentences from JSON.`);

  // 5. Clean up existing system examples (where word is null)
  console.log('Cleaning up existing system examples...');
  const deleteCount = await prisma.dictionaryExample.deleteMany({
    where: {
      word: null,
      language: 'ZH'
    }
  });
  console.log(`Deleted ${deleteCount.count} existing system examples.`);

  // 6. Map and prepare data
  const dataToInsert = sentences.map(item => ({
    word: null,
    pinyin: null,
    exampleHanzi: item.hanzi || '',
    examplePinyin: item.pinyin || '',
    exampleMeaning: item.meaning || '',
    language: 'ZH'
  }));

  // 7. Insert in chunks
  const chunkSize = 2000;
  let insertedCount = 0;

  for (let i = 0; i < dataToInsert.length; i += chunkSize) {
    const chunk = dataToInsert.slice(i, i + chunkSize);
    console.log(`Inserting chunk ${i / chunkSize + 1} (${chunk.length} rows)...`);
    
    await prisma.dictionaryExample.createMany({
      data: chunk,
      skipDuplicates: true
    });

    insertedCount += chunk.length;
  }

  console.log(`Successfully seeded ${insertedCount} sentences into DictionaryExample!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // close pg pool connection
  });
