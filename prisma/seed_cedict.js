const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const path = require('path');
const { getAllHanvietsOfChar } = require('hanviet-pinyin-words');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const toneMap = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function pinyinNumberToMark(pinyinStr) {
  if (!pinyinStr) return '';
  return pinyinStr.split(/\s+/).map(syllable => {
    const match = syllable.match(/^([a-zA-ZüÜ:vV]+)([1-5])?$/);
    if (!match) return syllable;
    let [_, word, tone] = match;
    tone = tone ? parseInt(tone, 10) : 5;
    if (tone === 5) {
      return word.replace(/u:/g, 'ü').replace(/v/g, 'ü');
    }

    word = word.replace(/u:/g, 'ü').replace(/v/g, 'ü');
    const toneIdx = tone - 1;

    if (/[aeAE]/.test(word)) {
      return word.replace(/([aeAE])/, (m) => {
        const isUpper = m === m.toUpperCase();
        const lower = m.toLowerCase();
        const marked = toneMap[lower][toneIdx];
        return isUpper ? marked.toUpperCase() : marked;
      });
    }
    if (/ou|OU|Ou/i.test(word)) {
      return word.replace(/([oO])/, (m) => {
        const isUpper = m === m.toUpperCase();
        const lower = m.toLowerCase();
        const marked = toneMap[lower][toneIdx];
        return isUpper ? marked.toUpperCase() : marked;
      });
    }
    return word.replace(/([aeiouvüAEIOUVÜ])(?=[^aeiouvüAEIOUVÜ]*$)/, (m) => {
      const isUpper = m === m.toUpperCase();
      const lower = m.toLowerCase();
      const marked = toneMap[lower] ? toneMap[lower][toneIdx] : m;
      return isUpper ? marked.toUpperCase() : marked;
    });
  }).join(' ');
}

function toPlainPinyin(pinyinStr) {
  if (!pinyinStr) return '';
  return pinyinStr.replace(/[0-9]/g, '').replace(/u:/g, 'ü').replace(/v/g, 'ü').toLowerCase().trim();
}

function getSinoVietnamese(hanziStr) {
  if (!hanziStr) return null;
  const chars = Array.from(hanziStr);
  const svParts = [];
  for (const c of chars) {
    if (!/[\u4e00-\u9fa5]/.test(c)) continue;
    const hvList = getAllHanvietsOfChar(c);
    if (hvList && hvList.length > 0) {
      svParts.push(hvList[0]);
    }
  }
  if (svParts.length === 0) return null;
  return svParts.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

async function main() {
  console.log('🚀 Starting CC-CEDICT Seeding Process...');

  console.log('Loading allData from cedict_pkg...');
  const allData = require('../cedict_pkg/package/data/all.js').default.all;
  console.log(`Loaded ${allData.length} entries from CC-CEDICT.`);

  console.log('Fetching existing HSK words from DictionaryWord...');
  const existingWords = await prisma.dictionaryWord.findMany({
    select: { s: true, p: true }
  });
  console.log(`Found ${existingWords.length} existing words in database.`);

  const existingSet = new Set();
  for (const w of existingWords) {
    if (w.s) {
      existingSet.add(`${w.s}:${(w.p || '').toLowerCase().trim()}`);
    }
  }

  const batchSize = 5000;
  let batch = [];
  let skippedHsk = 0;
  let totalInserted = 0;

  // We also track added in current session to prevent internal duplicates in cedict
  const insertedInThisRun = new Set();

  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    if (!item) continue;

    const t = item[0] || null;
    const s = item[1] || '';
    const pt = item[2] || '';
    if (!s) continue;

    const p = pinyinNumberToMark(pt);
    const sp = toPlainPinyin(pt);
    const dedupKey = `${s}:${p.toLowerCase().trim()}`;

    if (existingSet.has(dedupKey)) {
      skippedHsk++;
      continue;
    }

    if (insertedInThisRun.has(dedupKey)) {
      continue;
    }
    insertedInThisRun.add(dedupKey);

    const rawDef = item[3];
    let en = [];
    if (Array.isArray(rawDef)) {
      en = rawDef.map(e => String(e).trim()).filter(Boolean);
    } else if (typeof rawDef === 'string') {
      en = rawDef.split('/').map(e => e.trim()).filter(Boolean);
    }

    const sv = getSinoVietnamese(s);
    const viFallback = en.length > 0 ? en.join('; ') : null;

    batch.push({
      s,
      t,
      p: p || null,
      pt: pt || null,
      sp: sp || null,
      vi: viFallback,
      sv: sv || null,
      en,
      hsk: null,
      topicId: null
    });

    if (batch.length >= batchSize) {
      const res = await prisma.dictionaryWord.createMany({
        data: batch,
        skipDuplicates: true
      });
      totalInserted += res.count;
      console.log(`Inserted batch: +${res.count} words (total: ${totalInserted}, progress: ${i + 1}/${allData.length})`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    const res = await prisma.dictionaryWord.createMany({
      data: batch,
      skipDuplicates: true
    });
    totalInserted += res.count;
    console.log(`Inserted final batch: +${res.count} words (total: ${totalInserted})`);
  }

  console.log(`\n🎉 Seeding finished successfully!`);
  console.log(`- Total CC-CEDICT words processed: ${allData.length}`);
  console.log(`- Skipped existing HSK words: ${skippedHsk}`);
  console.log(`- New CC-CEDICT words added: ${totalInserted}`);
  const finalCount = await prisma.dictionaryWord.count();
  console.log(`- Total words now in database: ${finalCount}`);
}

main()
  .catch(console.error)
  .finally(() => {
    pool.end();
  });
