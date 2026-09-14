import { Component, OnInit, inject, signal, computed, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface WordItem {
  rank: number;
  word: string;
  count: number;
  percentage: number;
}

export interface DictData {
  items: WordItem[];
  totalTokens: number;
  uniqueTypes: number;
}

@Injectable({
  providedIn: 'root'
})
export class DictionaryService {
  private http = inject(HttpClient);

  loadDictionary(filePath: string): Observable<DictData> {
    return this.http.get(filePath, { responseType: 'text' }).pipe(
      map(tsvText => this.parseTsv(tsvText))
    );
  }

  private parseTsv(text: string): DictData {
    const lines = text.split('\n');
    const rawItems: { word: string; count: number }[] = [];
    let totalTokens = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [word, countStr] = line.split('\t');
      const count = parseInt(countStr, 10);
      if (word && !isNaN(count)) {
        rawItems.push({ word, count });
        totalTokens += count;
      }
    }

    const items: WordItem[] = rawItems.map((item, index) => ({
      rank: index + 1,
      word: item.word,
      count: item.count,
      percentage: totalTokens > 0 ? (item.count / totalTokens) * 100 : 0
    }));

    return { items, totalTokens, uniqueTypes: items.length };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private dictService = inject(DictionaryService);

  languages = [
    { id: 'ru', name: 'Русский', file: 'dicts/freq_dict_ru.txt' },
    { id: 'en', name: 'Английский', file: 'dicts/freq_dict_en.txt' },
    { id: 'et', name: 'Эстонский', file: 'dicts/freq_dict_et.txt' }
  ];

  selectedLang = signal<string>('ru');
  isLoading = signal<boolean>(false);
  currentData = signal<DictData>({ items: [], totalTokens: 0, uniqueTypes: 0 });
  searchQuery = signal<string>('');
  
  currentPage = signal<number>(1);
  pageSize = signal<number>(50);

  filteredItems = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const items = this.currentData().items;
    if (!query) return items;
    return items.filter(item => item.word.includes(query));
  });

  paginatedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredItems().slice(start, start + this.pageSize());
  });

  totalPages = computed(() => {
    return Math.ceil(this.filteredItems().length / this.pageSize()) || 1;
  });

  ngOnInit() {
    this.selectLanguage('ru');
  }

  selectLanguage(langId: string) {
    const lang = this.languages.find(l => l.id === langId);
    if (!lang) return;

    this.selectedLang.set(langId);
    this.isLoading.set(true);
    this.currentPage.set(1);
    this.searchQuery.set('');

    this.dictService.loadDictionary(lang.file).subscribe({
      next: (data) => {
        this.currentData.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Ошибка загрузки словаря:', err);
        this.isLoading.set(false);
      }
    });
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
    this.currentPage.set(1);
  }

  setPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }
}