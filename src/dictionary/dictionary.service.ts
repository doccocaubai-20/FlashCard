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
        const [pinyinMatches, meaningMatches] = await Promise.all([
          this.search('pinyin', q, true),
          this.search('meaning', q, true),
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
      // Check if query contains Chinese characters
      const isHanzi = /[\u4e00-\u9fa5]/.test(queryStr);
      if (!isHanzi) {
        return [];
      }

      // Exact matches on Simplified or Traditional
      const exactMatches = await this.prisma.dictionaryWord.findMany({
        where: {
          OR: [{ s: queryStr }, { t: queryStr }],
        },
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
          take: 150,
        });
      }
    } else if (type === 'pinyin') {
      // 1. Exact matches (case-sensitive because sp/p/pt are saved in lowercase and cleanQ is lowercased)
      const exactMatches = await this.prisma.dictionaryWord.findMany({
        where: {
          OR: [{ sp: cleanQ }, { p: cleanQ }, { pt: cleanQ }],
        },
        take: 150,
      });

      if (exactMatches.length >= 150) {
        results = exactMatches;
      } else {
        // 2. Prefix matches (startsWith) - case-sensitive to use B-tree index
        const prefixMatches = await this.prisma.dictionaryWord.findMany({
          where: {
            OR: [
              { sp: { startsWith: cleanQ } },
              { p: { startsWith: cleanQ } },
              { pt: { startsWith: cleanQ } },
            ],
            NOT: {
              id: { in: exactMatches.map((m) => m.id) },
            },
          },
          take: 150 - exactMatches.length,
        });
        results = [...exactMatches, ...prefixMatches];
      }
    } else if (type === 'meaning') {
      // 1. Exact sv match (case-sensitive)
      const exactSv = await this.prisma.dictionaryWord.findMany({
        where: { sv: cleanQ },
        take: 150,
      });

      if (exactSv.length >= 150) {
        results = exactSv;
      } else {
        // 2. Prefix sv match (case-sensitive)
        const prefixSv = await this.prisma.dictionaryWord.findMany({
          where: {
            sv: { startsWith: cleanQ },
            NOT: {
              id: { in: exactSv.map((m) => m.id) },
            },
          },
          take: 150 - exactSv.length,
        });

        const currentMatches = [...exactSv, ...prefixSv];
        if (currentMatches.length >= 150) {
          results = currentMatches;
        } else {
          // 3. Substring vi match (case-insensitive contains fallback)
          const containsVi = await this.prisma.dictionaryWord.findMany({
            where: {
              vi: { contains: cleanQ, mode: 'insensitive' },
              NOT: {
                id: { in: currentMatches.map((m) => m.id) },
              },
            },
            take: 150 - currentMatches.length,
          });
          results = [...currentMatches, ...containsVi];
        }
      }
    }

    // Filter out highly obscure/unnecessary variants unless they are exact query matches on simplified 's'
    results = results.filter((item) => {
      if (item.vi) {
        const lowerVi = item.vi.toLowerCase();
        if (
          lowerVi.includes('biến thể cổ') ||
          lowerVi.includes('biến thể của')
        ) {
          // Only allow variant if it's the exact Simplified character they queried
          if (item.s !== q.trim()) {
            return false;
          }
        }
      }
      return true;
    });

    // Sort results
    results.sort((a, b) => {
      // 1. Prioritize exact matches on simplified character first
      const aExactS = a.s === q.trim() ? 1 : 0;
      const bExactS = b.s === q.trim() ? 1 : 0;
      if (aExactS !== bExactS) return bExactS - aExactS;

      // 2. Prioritize HSK levels (HSK 1, 2, 3... first, null/0 last)
      const aHsk =
        a.hsk === null || a.hsk === undefined || a.hsk === 0 ? 99 : a.hsk;
      const bHsk =
        b.hsk === null || b.hsk === undefined || b.hsk === 0 ? 99 : b.hsk;
      if (aHsk !== bHsk) return aHsk - bHsk;

      // 3. Prioritize common/standard characters (non-variant first)
      const aIsVariant =
        a.vi && (a.vi.includes('biến thể') || a.vi.includes('biến thể cổ'))
          ? 1
          : 0;
      const bIsVariant =
        b.vi && (b.vi.includes('biến thể') || b.vi.includes('biến thể cổ'))
          ? 1
          : 0;
      if (aIsVariant !== bIsVariant) return aIsVariant - bIsVariant;

      // 4. Prioritize shorter Simplified word length (e.g. single character first)
      const aLen = a.s?.length || 0;
      const bLen = b.s?.length || 0;
      if (aLen !== bLen) return aLen - bLen;

      // 5. Fallback to ID
      return a.id - b.id;
    });

    // Enrich compound words' Hán Việt reading
    const enriched = await this.enrichMultipleSv(results);

    // Fetch example sentences from DictionaryExample for the matching results
    if (enriched.length > 0) {
      try {
        const itemsToFetch = multiple ? enriched.slice(0, 5) : enriched.slice(0, 1);
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
