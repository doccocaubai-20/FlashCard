import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Voice mapping for high-quality Microsoft Neural voices
const VOICE_MAP = {
  'zh-cn': { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' },
  'zh': { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' },
  'en-us': { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
  'en': { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
  'vi-vn': { female: 'vi-VN-HoaiMyNeural', male: 'vi-VN-NamMinhNeural' },
  'vi': { female: 'vi-VN-HoaiMyNeural', male: 'vi-VN-NamMinhNeural' },
};

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private supabase: SupabaseClient | null = null;

  // Simple in-memory cache: key -> Buffer
  private cache = new Map<string, Buffer>();
  private readonly MAX_CACHE_SIZE = 2000;

  constructor() {
    let url = process.env.SUPABASE_URL || '';
    let key = process.env.SUPABASE_SERVICE_KEY || '';

    // Clean surrounding quotes if any
    if (url.startsWith('"') && url.endsWith('"')) url = url.slice(1, -1);
    if (url.startsWith("'") && url.endsWith("'")) url = url.slice(1, -1);
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);

    if (url && key) {
      this.supabase = createClient(url, key);
      this.initializeBucket();
    } else {
      this.logger.warn('Supabase credentials missing. TTS storage caching will be disabled.');
    }
  }

  /**
   * Ensure 'tts' storage bucket exists in Supabase.
   */
  private async initializeBucket() {
    if (!this.supabase) return;
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) throw listError;

      const ttsBucket = buckets.find(b => b.name === 'tts');
      if (!ttsBucket) {
        this.logger.log('Supabase "tts" bucket not found. Creating public bucket...');
        const { error: createError } = await this.supabase.storage.createBucket('tts', {
          public: true,
          allowedMimeTypes: ['audio/mpeg'],
        });
        if (createError) throw createError;
        this.logger.log('Created public "tts" bucket successfully.');
      }
    } catch (err) {
      this.logger.error(`Failed to initialize Supabase "tts" bucket: ${err.message}`);
    }
  }

  /**
   * Get filesystem-safe structured fileName for a word.
   */
  private getFileName(text: string, lang: string, gender: string): string {
    const cleanText = text.trim();
    const hash = crypto.createHash('md5').update(cleanText).digest('hex');
    return `${lang.toLowerCase()}/${gender.toLowerCase()}/${hash}.mp3`;
  }

  /**
   * Check if a text is already cached in memory.
   */
  isCached(text: string, lang: string, gender: string): boolean {
    if (!text) return false;
    const cleanText = text.trim().slice(0, 500);
    const cacheKey = `${cleanText}|${lang}|${gender}`;
    return this.cache.has(cacheKey);
  }

  /**
   * Generate MP3 audio buffer from text using Microsoft Edge Neural TTS.
   * Caches files in Supabase Storage and streams via onChunk callback.
   */
  async generateSpeech(
    text: string,
    lang: string = 'zh-CN',
    gender: string = 'female',
    onChunk?: (chunk: Buffer) => void,
  ): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    const cleanText = text.trim().slice(0, 500);
    const cacheKey = `${cleanText}|${lang}|${gender}`;

    // 1. Check RAM Cache (fastest - under 5ms)
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (onChunk) {
        onChunk(cached);
      }
      return cached;
    }

    const fileName = this.getFileName(cleanText, lang, gender);

    // 2. Check Supabase Storage Cache
    // Optimized: Attempt download directly to save 1 network round-trip (eliminating the HEAD check)
    if (this.supabase) {
      const { data, error } = await this.supabase.storage.from('tts').download(fileName);
      if (!error && data) {
        this.logger.log(`TTS cache hit (Storage): "${cleanText.slice(0, 20)}"`);
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        if (onChunk) {
          onChunk(buffer);
        }
        
        // Save to RAM cache
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
          this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(cacheKey, buffer);
        return buffer;
      }
    }

    // 3. Generate Speech via Edge TTS (Cold Start - only if not in RAM and not in Storage)
    const langKey = lang.toLowerCase();
    const voiceGroup = VOICE_MAP[langKey] || VOICE_MAP['zh'];
    const voice = gender === 'male' ? voiceGroup.male : voiceGroup.female;

    this.logger.log(`TTS Cache Miss (Generating): "${cleanText.slice(0, 20)}..." voice=${voice}`);

    try {
      const { Communicate } = await import('edge-tts-universal');
      const communicate = new Communicate(cleanText, {
        voice,
        rate: langKey.startsWith('en') ? '-5%' : '-10%',
        pitch: '+0Hz',
      });

      const buffers: Buffer[] = [];
      for await (const chunk of communicate.stream()) {
        if (chunk.type === 'audio' && chunk.data) {
          const buf = chunk.data as Buffer;
          buffers.push(buf);
          if (onChunk) {
            onChunk(buf);
          }
        }
      }

      const buffer = Buffer.concat(buffers);
      if (buffer.length === 0) {
        throw new Error('No audio data received from TTS service');
      }

      // Save to RAM cache
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value);
      }
      this.cache.set(cacheKey, buffer);

      // 4. Save to Supabase Storage Cache in the background
      if (this.supabase) {
        this.supabase.storage
          .from('tts')
          .upload(fileName, buffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          })
          .then(({ error }) => {
            if (error) {
              this.logger.error(`Failed to save TTS to Supabase Storage: ${error.message}`);
            } else {
              this.logger.log(`Saved TTS cache (Storage) for "${cleanText.slice(0, 20)}"`);
            }
          });
      }

      return buffer;
    } catch (error) {
      this.logger.error(`TTS generation failed: ${error.message}`);
      throw error;
    }
  }
}
