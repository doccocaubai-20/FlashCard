import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ChengyuItem {
  id: string;
  chengyu: string;
  pinyin: string;
  sinoVietnamese: string;
  literalMeaning: string;
  figurativeMeaning: string;
  category: string;
  hskLevel: string;
  origin: {
    source: string;
    period: string;
    classicQuote?: string;
  };
  historicalStory: {
    summary: string;
    content: string;
  };
  modernUsage: {
    guideline: string;
    examples: Array<{
      hanzi: string;
      pinyin: string;
      vietnamese: string;
    }>;
  };
  synonyms: string[];
  antonyms: string[];
  moralLesson: string;
}

@Injectable()
export class ChengyuService {
  private readonly logger = new Logger(ChengyuService.name);
  private cache: ChengyuItem[] | null = null;
  private lastModified = 0;

  private getDataPath(): string {
    return path.join(process.cwd(), 'data', 'chengyu', 'chengyu.json');
  }

  private normalizeText(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  private loadAllChengyu(): ChengyuItem[] {
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
      this.logger.error(`Error loading chengyu.json: ${err.message}`);
      return this.cache || [];
    }
  }

  getSummary() {
    const all = this.loadAllChengyu();

    const categoryMap: Record<string, number> = {};
    const levelMap: Record<string, number> = {};

    all.forEach((item) => {
      const cat = item.category || 'Khác';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;

      const lvl = item.hskLevel || 'Chung';
      levelMap[lvl] = (levelMap[lvl] || 0) + 1;
    });

    // Chọn thành ngữ của ngày dựa theo ngày trong năm
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const featuredIndex = all.length > 0 ? dayOfYear % all.length : 0;
    const featuredToday = all[featuredIndex] || null;

    return {
      total: all.length,
      categories: Object.entries(categoryMap).map(([name, count]) => ({
        name,
        count,
      })),
      levels: Object.entries(levelMap).map(([name, count]) => ({
        name,
        count,
      })),
      featuredToday,
    };
  }

  getList(params: {
    category?: string;
    level?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const all = this.loadAllChengyu();
    let filtered = [...all];

    if (params.category && params.category !== 'ALL') {
      const targetCat = params.category.toLowerCase();
      filtered = filtered.filter(
        (x) => x.category?.toLowerCase() === targetCat,
      );
    }

    if (params.level && params.level !== 'ALL') {
      const targetLevel = params.level.toLowerCase();
      filtered = filtered.filter(
        (x) => x.hskLevel?.toLowerCase() === targetLevel,
      );
    }

    if (params.search && params.search.trim()) {
      const q = this.normalizeText(params.search.trim());
      filtered = filtered.filter((x) => {
        const matchHanzi = x.chengyu?.toLowerCase().includes(q);
        const matchPinyin = this.normalizeText(x.pinyin).includes(q);
        const matchSinoVi = this.normalizeText(x.sinoVietnamese).includes(q);
        const matchLiteral = this.normalizeText(x.literalMeaning).includes(q);
        const matchFigurative = this.normalizeText(
          x.figurativeMeaning,
        ).includes(q);
        return (
          matchHanzi ||
          matchPinyin ||
          matchSinoVi ||
          matchLiteral ||
          matchFigurative
        );
      });
    }

    const total = filtered.length;
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
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

  getDetail(idOrChengyu: string) {
    const all = this.loadAllChengyu();
    const item = all.find(
      (x) =>
        x.id === idOrChengyu ||
        x.chengyu === idOrChengyu ||
        x.chengyu.trim() === idOrChengyu.trim(),
    );

    if (!item) {
      throw new NotFoundException(`Không tìm thấy thành ngữ "${idOrChengyu}"`);
    }

    // Gợi ý thành ngữ liên quan trong cùng category
    const related = all
      .filter((x) => x.id !== item.id && x.category === item.category)
      .slice(0, 4)
      .map((x) => ({
        id: x.id,
        chengyu: x.chengyu,
        pinyin: x.pinyin,
        sinoVietnamese: x.sinoVietnamese,
        literalMeaning: x.literalMeaning,
        figurativeMeaning: x.figurativeMeaning,
      }));

    return {
      ...item,
      related,
    };
  }
}
