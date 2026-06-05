import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  // In-Memory Caches for static dictionary data
  private readonly searchCache = new Map<string, any>();
  private readonly hskPoolCache = new Map<number, any[]>();
  private syllablesCache: string[] | null = null;
  private readonly syllableDetailsCache = new Map<string, any[]>();
  private readonly radicalCache = new Map<string, any[]>();
  private wordOfTheDayCache: { date: string; word: any } | null = null;

  async search(type: string, q: string, multiple = false) {
    if (!q) return multiple ? [] : null;
    const cleanQ = q.toLowerCase().trim();
    const cacheKey = `${type}:${cleanQ}:${multiple}`;

    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    let results: any[] = [];

    if (type === 'hanzi') {
      const queryStr = q.trim();
      // Exact matches on Simplified or Traditional
      const exactMatches = await this.prisma.dictionaryWord.findMany({
        where: {
          OR: [
            { s: queryStr },
            { t: queryStr },
          ],
        },
      });

      if (exactMatches.length > 0) {
        results = exactMatches;
      } else {
        // Check if query contains Chinese characters
        const isHanzi = /[\u4e00-\u9fa5]/.test(queryStr);
        if (isHanzi) {
          results = await this.prisma.dictionaryWord.findMany({
            where: {
              OR: [
                { s: { startsWith: queryStr } },
                { t: { startsWith: queryStr } },
              ],
            },
            take: 30,
          });
        }
      }
    } else if (type === 'pinyin') {
      // 1. Exact matches
      const exactMatches = await this.prisma.dictionaryWord.findMany({
        where: {
          OR: [
            { p: { equals: cleanQ, mode: 'insensitive' } },
            { pt: { equals: cleanQ, mode: 'insensitive' } },
            { sp: { equals: cleanQ, mode: 'insensitive' } },
          ],
        },
        take: 30,
      });

      if (exactMatches.length >= 30) {
        results = exactMatches;
      } else {
        // 2. Prefix matches (startsWith)
        const prefixMatches = await this.prisma.dictionaryWord.findMany({
          where: {
            OR: [
              { p: { startsWith: cleanQ, mode: 'insensitive' } },
              { pt: { startsWith: cleanQ, mode: 'insensitive' } },
              { sp: { startsWith: cleanQ, mode: 'insensitive' } },
            ],
            NOT: {
              id: { in: exactMatches.map(m => m.id) }
            }
          },
          take: 30 - exactMatches.length,
        });
        results = [...exactMatches, ...prefixMatches];
      }
    } else if (type === 'meaning') {
      // 1. Exact sv match
      const exactSv = await this.prisma.dictionaryWord.findMany({
        where: { sv: { equals: cleanQ, mode: 'insensitive' } },
        take: 30,
      });

      if (exactSv.length >= 30) {
        results = exactSv;
      } else {
        // 2. Prefix sv match
        const prefixSv = await this.prisma.dictionaryWord.findMany({
          where: {
            sv: { startsWith: cleanQ, mode: 'insensitive' },
            NOT: {
              id: { in: exactSv.map(m => m.id) }
            }
          },
          take: 30 - exactSv.length,
        });

        const currentMatches = [...exactSv, ...prefixSv];
        if (currentMatches.length >= 30) {
          results = currentMatches;
        } else {
          // 3. Substring vi match
          const containsVi = await this.prisma.dictionaryWord.findMany({
            where: {
              vi: { contains: cleanQ, mode: 'insensitive' },
              NOT: {
                id: { in: currentMatches.map(m => m.id) }
              }
            },
            take: 30 - currentMatches.length,
          });
          results = [...currentMatches, ...containsVi];
        }
      }
    }

    // Enrich compound words' Hán Việt reading
    const enriched = await this.enrichMultipleSv(results);
    const finalResult = multiple ? enriched.slice(0, 30) : (enriched.length > 0 ? enriched[0] : null);

    // Cache final computed result
    this.searchCache.set(cacheKey, finalResult);
    return finalResult;
  }

  // Batch enrichment of Hán Việt readings for compound words
  async enrichMultipleSv(entries: any[]) {
    const missingSvEntries = entries.filter(e => !e.sv && e.s && e.s.length > 1);
    if (missingSvEntries.length === 0) return entries;

    // Collect all unique characters
    const allChars = new Set<string>();
    for (const e of missingSvEntries) {
      for (const c of Array.from(e.s as string)) {
        allChars.add(c);
      }
    }

    // Fetch sv for all unique characters
    const dbChars = await this.prisma.dictionaryWord.findMany({
      where: {
        s: { in: Array.from(allChars) },
      },
      select: {
        s: true,
        sv: true
      }
    });

    const svMap = new Map<string, string>();
    for (const dbChar of dbChars) {
      if (dbChar.sv && dbChar.s.length === 1) {
        svMap.set(dbChar.s, dbChar.sv);
      }
    }

    // Populate sv
    for (const e of entries) {
      if (!e.sv && e.s) {
        const chars = Array.from(e.s as string);
        const parts = chars.map(c => svMap.get(c) || `[${c}]`);
        e.sv = parts.join(' ').replace(/\s+/g, ' ').trim();
      }
    }

    return entries;
  }

  // Get HSK words for games (randomized using in-memory cached pools)
  async getHskWords(level: number, limit = 50) {
    let pool = this.hskPoolCache.get(level);
    if (!pool) {
      pool = await this.prisma.dictionaryWord.findMany({
        where: { hsk: level },
      });
      this.hskPoolCache.set(level, pool);
    }

    // Shuffle in memory and limit
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const enriched = await this.enrichMultipleSv(shuffled.slice(0, limit));
    return enriched;
  }

  // Get Word of the Day (random HSK 1-3 word, cached per calendar day)
  async getWordOfTheDay() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (this.wordOfTheDayCache && this.wordOfTheDayCache.date === todayStr) {
      return this.wordOfTheDayCache.word;
    }

    const candidates = await this.prisma.dictionaryWord.findMany({
      where: {
        hsk: { gte: 1, lte: 3 },
      },
    });
    const shortCandidates = candidates.filter(c => c.s && c.s.length <= 2);
    const pool = shortCandidates.length > 0 ? shortCandidates : candidates;
    let chosen: any;

    if (pool.length === 0) {
      const fallback = await this.prisma.dictionaryWord.findMany({
        take: 100
      });
      chosen = fallback[Math.floor(Math.random() * fallback.length)];
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }

    const enriched = await this.enrichMultipleSv([chosen]);
    const result = enriched[0];

    this.wordOfTheDayCache = {
      date: todayStr,
      word: result
    };
    return result;
  }

  // Get unique syllables list (for PinyinScreen, cached forever as it is static)
  async getSyllables() {
    if (this.syllablesCache) {
      return this.syllablesCache;
    }

    // Select all single characters with Pinyin
    const entries = await this.prisma.dictionaryWord.findMany({
      where: {
        s: {
          mode: 'default', // standard query
        },
      },
      select: {
        sp: true,
        s: true,
      },
    });

    const set = new Set<string>();
    for (const e of entries) {
      if (e.s.length === 1 && e.sp) {
        const spClean = e.sp.toLowerCase().trim();
        if (spClean.length <= 6 && !/\s/.test(spClean)) {
          set.add(spClean);
        }
      }
    }

    const result = Array.from(set).sort();
    this.syllablesCache = result;
    return result;
  }

  // Get syllable details (grouped by tone, cached)
  async getSyllableDetails(syllable: string) {
    const cleanSyllable = syllable.trim().toLowerCase();
    if (this.syllableDetailsCache.has(cleanSyllable)) {
      return this.syllableDetailsCache.get(cleanSyllable);
    }

    const entries = await this.prisma.dictionaryWord.findMany({
      where: {
        sp: { equals: cleanSyllable, mode: 'insensitive' },
      },
    });
    // Return entries that are single characters
    const result = entries.filter(e => e.s.length === 1);
    this.syllableDetailsCache.set(cleanSyllable, result);
    return result;
  }

  // Find words containing radical character (for RadicalScreen, cached)
  async getWordsByRadical(char: string) {
    const cleanChar = char.trim();
    if (this.radicalCache.has(cleanChar)) {
      return this.radicalCache.get(cleanChar);
    }

    // Query words containing the radical character
    const words = await this.prisma.dictionaryWord.findMany({
      where: {
        s: { contains: cleanChar },
      },
    });

    // Sort by HSK level (HSK 1-3 first) and stroke count descending
    const result = words.sort((a, b) => {
      const aHsk = a.hsk || 99;
      const bHsk = b.hsk || 99;
      if (aHsk !== bHsk) return aHsk - bHsk;
      const aB = a.b || 0;
      const bB = b.b || 0;
      return bB - aB;
    }).slice(0, 40); // limit 40

    this.radicalCache.set(cleanChar, result);
    return result;
  }
}
