import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WordItem, SortOrder, DictStats } from '../models/word.model';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  // ВСТАВЬТЕ ВАШИ ДАННЫЕ ИЗ SUPABASE
  private supabaseUrl = 'https://okwasnpvdrxzybvybpoo.supabase.co';
  private supabaseKey = 'sb_publishable_m5Rt4ybVPNj17GAbEIBtxA_DUnU9Bam';
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(this.supabaseUrl, this.supabaseKey);
  }

  // Загрузка статистики словаря через RPC-функцию Postgres
  async getStats(lang: string, source: string): Promise<DictStats> {
    const { data, error } = await this.client.rpc('get_dict_stats', {
      p_lang: lang,
      p_source: source
    });
    if (error || !data || data.length === 0) {
      return { totalTokens: 0, uniqueWords: 0 };
    }
    return {
      totalTokens: Number(data[0].total_tokens),
      uniqueWords: Number(data[0].unique_words)
    };
  }

  // Получение слов с сервера с пагинацией, фильтрацией по префиксу и сортировкой
  async getWords(
    lang: string,
    source: string,
    prefix: string,
    sort: SortOrder,
    page: number,
    pageSize: number
  ): Promise<{ items: WordItem[]; totalCount: number }> {
    let query = this.client
      .from('dictionary_words')
      .select('*', { count: 'exact' })
      .eq('language', lang)
      .eq('source', source);

    // Поиск строго по началу слова
    if (prefix.trim()) {
      query = query.like('word', `${prefix.trim().toLowerCase()}%`);
    }

    // Сортировка на стороне PostgreSQL
    switch (sort) {
      case 'freq-desc': query = query.order('count', { ascending: false }); break;
      case 'freq-asc': query = query.order('count', { ascending: true }); break;
      case 'alpha-asc': query = query.order('word', { ascending: true }); break;
      case 'alpha-desc': query = query.order('word', { ascending: false }); break;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error(error);
      return { items: [], totalCount: 0 };
    }

    return { items: (data as WordItem[]) || [], totalCount: count || 0 };
  }

  // Добавление нового слова с частотой 0
  async addWord(lang: string, source: string, word: string): Promise<void> {
    await this.client.from('dictionary_words').insert({
      language: lang,
      source: source,
      word: word,
      count: 0
    });
  }

  // Удаление слова
  async deleteWord(lang: string, source: string, word: string): Promise<void> {
    await this.client
      .from('dictionary_words')
      .delete()
      .match({ language: lang, source: source, word: word });
  }

  // Исправление слова с суммированием частот
  async editAndMerge(lang: string, source: string, oldWord: string, newWord: string): Promise<void> {
    const { data: oldData } = await this.client
      .from('dictionary_words')
      .select('count')
      .match({ language: lang, source: source, word: oldWord })
      .single();

    if (!oldData) return;

    const { data: targetData } = await this.client
      .from('dictionary_words')
      .select('count')
      .match({ language: lang, source: source, word: newWord })
      .maybeSingle();

    const mergedCount = (targetData ? targetData.count : 0) + oldData.count;

    await this.client.from('dictionary_words').upsert({
      language: lang,
      source: source,
      word: newWord,
      count: mergedCount
    });

    await this.deleteWord(lang, source, oldWord);
  }

  // Пополнение словаря текстом
  async bulkIncrement(lang: string, source: string, wordCounts: Record<string, number>): Promise<void> {
    const words = Object.keys(wordCounts);
    
    // Получаем текущие частоты этих слов из БД
    const { data } = await this.client
      .from('dictionary_words')
      .select('word, count')
      .eq('language', lang)
      .eq('source', source)
      .in('word', words);

    const existingMap = new Map<string, number>();
    (data || []).forEach((row: any) => existingMap.set(row.word, row.count));

    const upsertPayload = words.map(w => ({
      language: lang,
      source: source,
      word: w,
      count: (existingMap.get(w) || 0) + wordCounts[w]
    }));

    await this.client.from('dictionary_words').upsert(upsertPayload);
  }
}