require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const total = await prisma.dictionaryWord.count();
    console.log(`\n📖 Tổng số từ trong DictionaryWord: ${total.toLocaleString()}\n`);

    // HSK phân cấp
    console.log('📊 Phân loại theo HSK:');
    for (let level = 1; level <= 9; level++) {
      const count = await prisma.dictionaryWord.count({ where: { hsk: level } });
      if (count > 0) console.log(`  HSK ${level}: ${count.toLocaleString()} từ`);
    }
    const noHsk = await prisma.dictionaryWord.count({ where: { hsk: null } });
    console.log(`  Không có HSK: ${noHsk.toLocaleString()} từ`);

    // Xem 5 ví dụ
    console.log('\n🔍 5 từ mẫu trong database:');
    const samples = await prisma.dictionaryWord.findMany({ take: 5 });
    samples.forEach(w => {
      console.log(`  [${w.id}] ${w.s} (${w.t || w.s}) | ${w.p} | HV: ${w.sv} | VI: ${(w.vi || '').substring(0, 40)}`);
    });

    // Thử search
    console.log('\n🔎 Thử search từ "学":');
    const search = await prisma.dictionaryWord.findMany({
      where: { s: { contains: '学' } },
      take: 5,
    });
    search.forEach(w => {
      console.log(`  ${w.s} | ${w.p} | ${w.sv} | ${(w.vi || '').substring(0, 50)}`);
    });

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    await pool.end();
  }
}

main();
