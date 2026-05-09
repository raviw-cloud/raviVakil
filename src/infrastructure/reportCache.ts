import { config } from '../config';
import type { ReviewResult } from '../domain/reviewResult.schema';

export interface CachedReport {
  results: ReviewResult;
  score: number;
  grade: string;
  recommendation: string;
  filename: string;
  createdAt: Date;
}

export interface IReportRepo {
  save(id: string, data: Omit<CachedReport, 'createdAt'>): Promise<void>;
  get(id: string): Promise<CachedReport | null>;
}

class InMemoryReportRepo implements IReportRepo {
  private cache = new Map<string, CachedReport>();

  async save(id: string, data: Omit<CachedReport, 'createdAt'>): Promise<void> {
    this.cache.set(id, { ...data, createdAt: new Date() });
    if (this.cache.size > config.CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }

  async get(id: string): Promise<CachedReport | null> {
    return this.cache.get(id) ?? null;
  }
}

export const reportRepo: IReportRepo = new InMemoryReportRepo();
