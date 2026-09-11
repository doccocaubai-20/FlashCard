import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface HanziMnemonicItem {
  char: string;
  pinyin: string;
  sinoVietnamese: string;
  hskLevel: string;
  strokeCount: number;
  mainRadical: {
    char: string;
    name: string;
    meaning: string;
  };
  components: Array<{
    char: string;
    meaning: string;
  }>;
  mnemonicStory: string;
  etymologyType: string;
  meaning: string;
  commonWords: Array<{
    word: string;
    pinyin: string;
    meaning: string;
  }>;
  exampleSentence: {
    hanzi: string;
    pinyin: string;
    vietnamese: string;
  };
}

@Injectable()
export class HanziMnemonicsService {
  private readonly logger = new Logger(HanziMnemonicsService.name);
  private cache: HanziMnemonicItem[] | null = null;
  private lastModified = 0;

  private getDataPath(): string {
    return path.join(process.cwd(), 'data', 'hanzi-mnemonics', 'hanzi_mnemonics.json');
  }

  private normalizeText(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  private loadAll(): HanziMnemonicItem[] {
    const filePath = this.getDataPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const stats = fs.statSync(filePath);
      if (!this.cache || stats.mtimeMs > this.lastModified) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        this.cache = JSON.parse(raw);
        this.lastModified = stats.mtimeMs;
      }
      return this.cache || [];
    } catch (err) {
      this.logger.error(`Error loading hanzi_mnemonics.json: ${err.message}`);
      return this.cache || [];
    }
  }

  getSummary() {
    const all = this.loadAll();

    const levelMap: Record<string, number> = {};
    const radicalMap: Record<string, number> = {};
    const etymologyMap: Record<string, number> = {};

    all.forEach((item) => {
      const lvl = item.hskLevel || 'Chung';
      levelMap[lvl] = (levelMap[lvl] || 0) + 1;

      const rad = item.mainRadical?.name || item.mainRadical?.char || 'Khác';
      radicalMap[rad] = (radicalMap[rad] || 0) + 1;

      const ety = item.etymologyType || 'Khác';
      etymologyMap[ety] = (etymologyMap[ety] || 0) + 1;
    });

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const featuredIndex = all.length > 0 ? dayOfYear % all.length : 0;
    const featuredToday = all[featuredIndex] || null;

    return {
      total: all.length,
      levels: Object.entries(levelMap).map(([name, count]) => ({ name, count })),
      radicals: Object.entries(radicalMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      etymologies: Object.entries(etymologyMap).map(([name, count]) => ({ name, count })),
      featuredToday,
    };
  }

  getList(params: {
    level?: string;
    radical?: string;
    etymology?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const all = this.loadAll();
    let filtered = [...all];

    if (params.level && params.level !== 'ALL') {
      const targetLvl = params.level.toLowerCase();
      filtered = filtered.filter((x) => x.hskLevel?.toLowerCase() === targetLvl);
    }

    if (params.etymology && params.etymology !== 'ALL') {
      const targetEty = params.etymology.toLowerCase();
      filtered = filtered.filter((x) => x.etymologyType?.toLowerCase().includes(targetEty));
    }

    if (params.radical && params.radical !== 'ALL') {
      const targetRad = params.radical.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.mainRadical?.char?.toLowerCase() === targetRad ||
          x.mainRadical?.name?.toLowerCase().includes(targetRad),
      );
    }

    if (params.search && params.search.trim()) {
      const q = this.normalizeText(params.search.trim());
      filtered = filtered.filter((x) => {
        const matchChar = x.char?.toLowerCase().includes(q);
        const matchPinyin = this.normalizeText(x.pinyin).includes(q);
        const matchSinoVi = this.normalizeText(x.sinoVietnamese).includes(q);
        const matchMeaning = this.normalizeText(x.meaning).includes(q);
        const matchStory = this.normalizeText(x.mnemonicStory).includes(q);
        const matchRadical = this.normalizeText(x.mainRadical?.name).includes(q);
        return matchChar || matchPinyin || matchSinoVi || matchMeaning || matchStory || matchRadical;
      });
    }

    const total = filtered.length;
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 24));
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  getByChar(char: string) {
    const all = this.loadAll();
    const cleanChar = char.trim();
    const item = all.find((x) => x.char === cleanChar);

    if (!item) {
      throw new NotFoundException(`Không tìm thấy chiết tự cho chữ "${cleanChar}"`);
    }

    // Lấy thêm các chữ có cùng bộ thủ chính để gợi ý học liên đới
    const sameRadical = all
      .filter((x) => x.char !== item.char && x.mainRadical?.char === item.mainRadical?.char)
      .slice(0, 6)
      .map((x) => ({
        char: x.char,
        pinyin: x.pinyin,
        sinoVietnamese: x.sinoVietnamese,
        meaning: x.meaning,
      }));

    return {
      ...item,
      sameRadical,
    };
  }
}
