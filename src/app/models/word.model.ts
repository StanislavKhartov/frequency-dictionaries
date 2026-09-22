export interface WordItem {
  language: string;
  source: string;
  word: string;
  count: number;
}

export type SortOrder = 'freq-desc' | 'freq-asc' | 'alpha-asc' | 'alpha-desc';

export interface DictStats {
  totalTokens: number;
  uniqueWords: number;
}