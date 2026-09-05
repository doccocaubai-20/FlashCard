import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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

    if (type === 'all') {
      const isHanzi = /[\u4e00-\u9fa5]/.test(q);
      if (isHanzi) {
        results = await this.search('hanzi', q, true);
        if (results.length === 0 && cleanQ.length > 2) {
          results = await this.segmentHanziSentence(cleanQ);
        }
      } else {
        // Query Pinyin, Vietnamese meaning, and English translations concurrently
        const [pinyinMatches, meaningMatches, englishMatches] =
          await Promise.all([
            this.search('pinyin', q, true),
            this.search('meaning', q, true),
            this.search('english', q, true),
          ]);

        const combined = [
          ...(Array.isArray(pinyinMatches)
            ? pinyinMatches
            : pinyinMatches
              ? [pinyinMatches]
              : []),
          ...(Array.isArray(meaningMatches)
            ? meaningMatches
            : meaningMatches
              ? [meaningMatches]
              : []),
          ...(Array.isArray(englishMatches)
            ? englishMatches
            : englishMatches
              ? [englishMatches]
              : []),
        ];

        const seen = new Set();
        const deduplicated: any[] = [];
        for (const item of combined) {
          if (!item) continue;
          const key = `${item.s}-${item.p}-${item.vi}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduplicated.push(item);
          }
        }
        results = deduplicated;
      }
    } else if (type === 'hanzi') {
      const queryStr = q.trim();
      const isHanzi = /[\u4e00-\u9fa5]/.test(queryStr);
      if (!isHanzi) {
        return [];
      }

      // Exact matches on Simplified or Traditional first
      const exactMatches = await this.prisma.dictionaryWord.findMany({
        where: {
          OR: [{ s: queryStr }, { t: queryStr }],
        },
        orderBy: [{ hsk: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      });

      if (exactMatches.length > 0) {
        results = exactMatches;
      } else {
        results = await this.prisma.dictionaryWord.findMany({
          where: {
            OR: [
              { s: { startsWith: queryStr } },
              { t: { startsWith: queryStr } },
            ],
          },
          orderBy: [{ hsk: { sort: 'asc', nulls: 'last' } }, { s: 'asc' }],
          take: 150,
        });
      }
    } else if (type === 'pinyin') {
      try {
        // Exact matches with tonal, numeric or tone-free pinyin, prioritizing HSK 1-7 and shorter words
        const matches = await this.prisma.$queryRawUnsafe<any[]>(
          `
          SELECT id, s, t, p, pt, sp, vi, sv, en, hsk, "topicId"
          FROM "DictionaryWord"
          WHERE sp = $1 OR p = $1 OR pt = $1 OR sp LIKE $2
          ORDER BY
            CASE 
              WHEN p = $1 OR pt = $1 THEN 1
              WHEN sp = $1 THEN 2
              WHEN sp LIKE $2 THEN 3
              ELSE 4
            END,
            CASE WHEN hsk IS NOT NULL AND hsk > 0 THEN hsk ELSE 99 END ASC,
            LENGTH(s) ASC,
            id ASC
          LIMIT 150
        `,
          cleanQ,
          `${cleanQ}%`,
        );
        results = matches || [];
      } catch (err) {
        console.error('Pinyin search error:', err);
        results = [];
      }
    } else if (type === 'meaning') {
      try {
        // Query ordered intelligently so HSK words and exact matches are always in the candidate set
        const matches = await this.prisma.$queryRawUnsafe<any[]>(
          `
          SELECT id, s, t, p, pt, sp, vi, sv, en, hsk, "topicId"
          FROM "DictionaryWord"
          WHERE vi ILIKE $1 OR sv ILIKE $2
          ORDER BY 
            CASE 
              WHEN sv = $3 THEN 1
              WHEN vi ILIKE $4 OR vi ILIKE $5 OR vi ILIKE $6 THEN 2
              WHEN vi ILIKE $7 THEN 3
              ELSE 4
            END,
            CASE WHEN hsk IS NOT NULL AND hsk > 0 THEN hsk ELSE 99 END ASC,
            LENGTH(s) ASC,
            LENGTH(vi) ASC
          LIMIT 150
        `,
          `%${cleanQ}%`,
          `%${cleanQ}%`,
          cleanQ,
          `${cleanQ}`,
          `${cleanQ} /%`,
          `${cleanQ}; %`,
          `${cleanQ}%`,
        );
        results = matches || [];
      } catch (err) {
        console.error('Meaning search error:', err);
        results = [];
      }
    } else if (type === 'english') {
      try {
        const enMatches = await this.prisma.$queryRawUnsafe<any[]>(
          `
          SELECT id, s, t, p, pt, sp, vi, sv, en, hsk, "topicId"
          FROM "DictionaryWord"
          WHERE array_to_string(en, ' ') ILIKE $1
          ORDER BY
            CASE 
              WHEN 'to ' || $2 = ANY(en) OR $2 = ANY(en) THEN 1
              WHEN array_to_string(en, ' ') ILIKE $3 THEN 2
              ELSE 3
            END,
            CASE WHEN hsk IS NOT NULL AND hsk > 0 THEN hsk ELSE 99 END ASC,
            LENGTH(s) ASC
          LIMIT 100
        `,
          `%${cleanQ}%`,
          cleanQ,
          `%to ${cleanQ}%`,
        );
        results = enMatches || [];
      } catch (err) {
        console.error('English search error:', err);
        results = [];
      }
    }

    // Score and filter results by relevance
    const scoredResults = results
      .map((item) => ({ item, score: this.calculateRelevanceScore(item, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);

    results = scoredResults;

    // Enrich compound words' Hán Việt reading
    const enriched = await this.enrichMultipleSv(results);

    // Fetch example sentences from DictionaryExample for the matching results
    if (enriched.length > 0) {
      try {
        const itemsToFetch = multiple
          ? enriched.slice(0, 5)
          : enriched.slice(0, 1);
        const words = itemsToFetch.map((item) => item.s).filter(Boolean);

        if (words.length > 0) {
          const examples = await this.prisma.dictionaryExample.findMany({
            where: {
              OR: [
                { word: { in: words } },
                ...words.map((w) => ({
                  exampleHanzi: {
                    contains: w,
                  },
                })),
              ],
              language: 'ZH',
            },
            take: 100,
          });

          for (const item of enriched) {
            const matchingExamples = examples.filter(
              (ex) =>
                ex.word === item.s ||
                (ex.exampleHanzi && ex.exampleHanzi.includes(item.s)),
            );

            // Limit to a pool of 5 matching examples, shuffle them, and display up to 3 sentences
            const pool = matchingExamples.slice(0, 5);
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, 3);

            item.examples = selected.map((ex) => ({
              hanzi: ex.exampleHanzi,
              pinyin: ex.examplePinyin || '',
              meaning: ex.exampleMeaning,
              source: ex.word ? 'AI thực tế' : 'Khẩu ngữ phim',
            }));
          }
        }
      } catch (err) {
        console.error('Failed to enrich dictionary search with examples:', err);
      }
    }

    const finalResult = multiple
      ? enriched.slice(0, 30)
      : enriched.length > 0
        ? enriched[0]
        : null;

    // Cache final computed result
    this.searchCache.set(cacheKey, finalResult);
    return finalResult;
  }

  private calculateRelevanceScore(item: any, rawQ: string): number {
    const q = rawQ.trim();
    const qLower = q.toLowerCase();
    const s = (item.s || '').toLowerCase();
    const t = (item.t || '').toLowerCase();
    const p = (item.p || '').toLowerCase();
    const pt = (item.pt || '').toLowerCase();
    const sp = (item.sp || '').toLowerCase();
    const sv = (item.sv || '').toLowerCase();
    const vi = (item.vi || '').toLowerCase();
    const enStr = Array.isArray(item.en)
      ? item.en.join(' ').toLowerCase()
      : (item.en || '').toLowerCase();

    let score = 0;

    // 1. Exact Hanzi match (Highest priority)
    if (s === qLower || t === qLower) {
      score += 100000;
    } else if (s.startsWith(qLower) || t.startsWith(qLower)) {
      score += 40000;
    } else if (s.includes(qLower) || t.includes(qLower)) {
      score += 20000;
    }

    // 2. Exact Pinyin match
    if (p === qLower || pt === qLower) {
      score += 80000; // Exact tonal match e.g. "hē"
    } else if (sp === qLower) {
      score += 65000; // Exact tone-stripped match e.g. "he"
    } else if (p.startsWith(qLower) || pt.startsWith(qLower)) {
      score += 30000;
    } else if (sp.startsWith(qLower)) {
      score += 20000;
    } else if (sp.includes(` ${qLower}`) || sp.includes(`${qLower} `)) {
      score += 10000;
    }

    // 3. Exact Hán-Việt reading match
    if (sv === qLower) {
      score += 50000;
    } else if (sv.startsWith(qLower)) {
      score += 25000;
    } else if (sv.split(/[\s·-]+/).includes(qLower)) {
      score += 15000;
    }

    // 4. Meaning matching (Vietnamese)
    const cleanViFirstPart = vi.split(/[/;,()]/)[0].trim();
    if (cleanViFirstPart === qLower || vi === qLower) {
      score += 50000;
    } else if (cleanViFirstPart.startsWith(qLower) || vi.startsWith(qLower)) {
      score += 35000;
    } else {
      const escapedQ = qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundaryRegex = new RegExp(
        `(^|[^a-zà-ỹ0-9])${escapedQ}([^a-zà-ỹ0-9]|$)`,
        'i',
      );
      if (wordBoundaryRegex.test(vi)) {
        score += 20000;
      }
    }

    // 5. English matching
    if (Array.isArray(item.en)) {
      const enLower = item.en.map((e: string) => e.toLowerCase());
      if (enLower.includes(qLower) || enLower.includes(`to ${qLower}`)) {
        score += 50000;
      } else if (
        enLower.some(
          (e: string) => e.startsWith(qLower) || e.startsWith(`to ${qLower}`),
        )
      ) {
        score += 30000;
      } else if (enStr.includes(qLower)) {
        score += 15000;
      }
    }

    // If no match was found across Hanzi, Pinyin, SV, Vi, or English, drop it
    if (score === 0) {
      return 0;
    }

    // 6. Dominant HSK 1-6 boost (core everyday words always rank highest)
    if (item.hsk && item.hsk >= 1 && item.hsk <= 6) {
      score += (7 - item.hsk) * 5000; // HSK 1 gets +30,000, HSK 2 gets +25,000, etc.
    }

    // 7. Shorter word length boost (single characters / concise words first)
    const len = item.s?.length || 1;
    score += Math.max(0, (5 - len) * 500);

    // 8. Penalties ONLY for pure surnames or pure variants
    const isPureSurname = /^họ\s*\[/i.test(vi) || /^họ\s+[a-zà-ỹ]+/i.test(vi);
    const isPureVariant = /^biến thể (của|cổ của)\b/i.test(vi);
    if (isPureSurname || isPureVariant) {
      score -= 25000;
    }

    return score;
  }

  // Batch enrichment of Hán Việt readings for compound words
  async enrichMultipleSv(entries: any[]) {
    const missingSvEntries = entries.filter(
      (e) => !e.sv && e.s && e.s.length > 1,
    );
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
        sv: true,
      },
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
        const parts = chars.map((c) => svMap.get(c) || `[${c}]`);
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

  // Get Word of the Day (random HSK 1-7 word, cached per calendar day)
  async getWordOfTheDay() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (this.wordOfTheDayCache && this.wordOfTheDayCache.date === todayStr) {
      return this.wordOfTheDayCache.word;
    }

    const candidates = await this.prisma.dictionaryWord.findMany({
      where: {
        hsk: { gte: 1, lte: 7 },
      },
    });
    const shortCandidates = candidates.filter((c) => c.s && c.s.length <= 2);
    const pool = shortCandidates.length > 0 ? shortCandidates : candidates;
    let chosen: any;

    if (pool.length === 0) {
      const fallback = await this.prisma.dictionaryWord.findMany({
        take: 100,
      });
      chosen = fallback[Math.floor(Math.random() * fallback.length)];
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }

    const enriched = await this.enrichMultipleSv([chosen]);
    const result = enriched[0];

    this.wordOfTheDayCache = {
      date: todayStr,
      word: result,
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
    const result = entries.filter((e) => e.s.length === 1);
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
    const result = words
      .sort((a, b) => {
        const aHsk = a.hsk || 99;
        const bHsk = b.hsk || 99;
        if (aHsk !== bHsk) return aHsk - bHsk;
        const aB = a.b || 0;
        const bB = b.b || 0;
        return bB - aB;
      })
      .slice(0, 40); // limit 40

    this.radicalCache.set(cleanChar, result);
    return result;
  }

  async segmentHanziSentence(text: string) {
    const cleanText = text
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?？。！，、；：\s]/g, '')
      .trim();
    if (!cleanText) return [];

    const chars = Array.from(cleanText);
    const result: any[] = [];
    let i = 0;
    const maxWordLength = 8;

    while (i < chars.length) {
      let matched = false;
      for (
        let len = Math.min(maxWordLength, chars.length - i);
        len >= 1;
        len--
      ) {
        const word = chars.slice(i, i + len).join('');
        const matches = await this.prisma.dictionaryWord.findMany({
          where: {
            OR: [{ s: word }, { t: word }],
          },
        });
        const exact = matches.find((m) => m.s === word || m.t === word);
        if (exact) {
          result.push({ ...exact, isSegmentedPart: true });
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        const char = chars[i];
        result.push({
          s: char,
          t: char,
          p: '',
          vi: 'Từ tố chưa được cập nhật',
          isVirtual: true,
          isSegmentedPart: true,
        });
        i++;
      }
    }
    return this.enrichMultipleSv(result);
  }

  async compareSynonyms(word1: string, word2: string) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key is not configured on the server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const prompt = `Bạn là một giáo viên dạy tiếng Trung chuyên nghiệp. Hãy phân biệt chi tiết cách dùng của hai từ đồng nghĩa sau: "${word1}" và "${word2}".
    Yêu cầu cấu trúc kết quả trả về bằng định dạng Markdown rõ ràng gồm:
    1. Định nghĩa ngắn gọn của từng từ.
    2. Điểm giống nhau giữa 2 từ.
    3. Điểm khác biệt quan trọng (về ngữ cảnh sử dụng, cấu trúc ngữ pháp đi kèm).
    4. Cung cấp 2 câu ví dụ thực tế cho mỗi từ (kèm chữ Hán, Pinyin và dịch nghĩa tiếng Việt).`;

    try {
      const response = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      return { explanation: resJson.choices[0].message.content };
    } catch (err) {
      console.error('Failed to compare synonyms:', err);
      const error = err as any;
      const isTimeout =
        error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận, vui lòng thử lại sau vài giây!'
          : 'Không thể so sánh bằng AI: ' + (error?.message || String(err)),
        isTimeout ? HttpStatus.REQUEST_TIMEOUT : HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async ocrAnalyze(text: string) {
    if (text.length <= 6) {
      return { isLongSentence: false, originalText: text };
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new HttpException(
        'DeepSeek API Key is not configured on the server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const prompt = `Phân tích câu tiếng Trung sau: "${text}".
    Yêu cầu trả về cấu trúc định dạng JSON chính xác như sau (và TUYỆT ĐỐI không bọc trong khối code markdown \`\`\`json):
    {
      "pinyin": "Phiên âm Pinyin toàn bộ câu",
      "translation": "Dịch nghĩa tiếng Việt toàn bộ câu",
      "words": [
        { "word": "Từ đơn/Từ ghép trích ra từ câu", "meaning": "Nghĩa tiếng Việt ngắn gọn của từ này" }
      ]
    }`;

    try {
      const response = await fetch(
        'https://api.deepseek.com/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const resJson: any = await response.json();
      const result = JSON.parse(resJson.choices[0].message.content);

      return {
        isLongSentence: true,
        originalText: text,
        ...result,
      };
    } catch (err) {
      console.error('Failed to analyze OCR sentence:', err);
      const error = err as any;
      const isTimeout =
        error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new HttpException(
        isTimeout
          ? 'AI đang bận, vui lòng thử lại sau vài giây!'
          : 'Không thể phân tích bằng AI: ' + (error?.message || String(err)),
        isTimeout ? HttpStatus.REQUEST_TIMEOUT : HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
