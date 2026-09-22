import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from './services/supabase.service';
import { TextProcessorService } from './services/text-processor.service';
import { WordItem, SortOrder, DictStats } from './models/word.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private supabase = inject(SupabaseService);
  private tokenizer = inject(TextProcessorService);

  languages = [
    { id: 'ru', name: 'Русский' },
    { id: 'en', name: 'Английский' },
    { id: 'et', name: 'Эстонский' }
  ];

  sources = [
    { id: 'web', name: 'Википедия' },
    { id: 'subs', name: 'Субтитры' }
  ];

  selectedLang = signal<string>('ru');
  selectedSource = signal<string>('web');

  isLoading = signal<boolean>(false);
  words = signal<WordItem[]>([]);
  totalMatches = signal<number>(0);
  stats = signal<DictStats>({ totalTokens: 0, uniqueWords: 0 });

  searchPrefix = signal<string>('');
  currentSort = signal<SortOrder>('freq-desc');

  currentPage = signal<number>(1);
  pageSize = signal<number>(50);

  totalPages = computed(() => Math.ceil(this.totalMatches() / this.pageSize()) || 1);

  showAddModal = signal<boolean>(false);
  newWordInput = signal<string>('');
  newText = signal<string>('');

  async ngOnInit() {
    await this.refreshData();
  }

  async selectLanguage(lang: string) {
    this.selectedLang.set(lang);
    this.currentPage.set(1);
    this.searchPrefix.set('');
    await this.refreshData();
  }

  async selectSource(src: string) {
    this.selectedSource.set(src);
    this.currentPage.set(1);
    this.searchPrefix.set('');
    await this.refreshData();
  }

  async refreshData() {
    this.isLoading.set(true);
    try {
      const [statsData, wordsData] = await Promise.all([
        this.supabase.getStats(this.selectedLang(), this.selectedSource()),
        this.supabase.getWords(
          this.selectedLang(),
          this.selectedSource(),
          this.searchPrefix(),
          this.currentSort(),
          this.currentPage(),
          this.pageSize()
        )
      ]);
      this.stats.set(statsData);
      this.words.set(wordsData.items);
      this.totalMatches.set(wordsData.totalCount);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSearchChange(val: string) {
    this.searchPrefix.set(val);
    this.currentPage.set(1);
    await this.refreshData();
  }

  async setSort(order: SortOrder) {
    this.currentSort.set(order);
    this.currentPage.set(1);
    await this.refreshData();
  }

  async setPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      await this.refreshData();
    }
  }

  async handleAddWord() {
    const raw = this.newWordInput().trim().toLowerCase();
    if (!raw) return;

    const tokens = this.tokenizer.tokenize(raw, this.selectedLang());
    if (!tokens.length) {
      alert('Недопустимые символы для языка!');
      return;
    }
    const cleanWord = tokens[0];

    try {
      await this.supabase.addWord(this.selectedLang(), this.selectedSource(), cleanWord);
      this.newWordInput.set('');
      this.showAddModal.set(false);
      await this.refreshData();
    } catch (e) {
      alert(`Слово "${cleanWord}" уже есть в словаре!`);
    }
  }

  async handleEditWord(item: WordItem) {
    const input = prompt(`Исправление слова "${item.word}".\nВведите правильное написание:`, item.word);
    if (!input) return;

    const tokens = this.tokenizer.tokenize(input, this.selectedLang());
    if (!tokens.length) return;
    const target = tokens[0];
    if (target === item.word) return;

    this.isLoading.set(true);
    await this.supabase.editAndMerge(this.selectedLang(), this.selectedSource(), item.word, target);
    await this.refreshData();
  }

  async handleDeleteWord(item: WordItem) {
    const ok = confirm(`ВНИМАНИЕ! Удалить слово "${item.word}" (частота: ${item.count})?`);
    if (!ok) return;

    this.isLoading.set(true);
    await this.supabase.deleteWord(this.selectedLang(), this.selectedSource(), item.word);
    await this.refreshData();
  }

  async handleAddText() {
    const text = this.newText().trim();
    if (!text) return;

    const tokens = this.tokenizer.tokenize(text, this.selectedLang());
    if (!tokens.length) {
      alert('Нет подходящих слов в тексте!');
      return;
    }

    const counts: Record<string, number> = {};
    for (const t of tokens) counts[t] = (counts[t] || 0) + 1;

    this.isLoading.set(true);
    await this.supabase.bulkIncrement(this.selectedLang(), this.selectedSource(), counts);
    this.newText.set('');
    await this.refreshData();
    alert(`Добавлено ${tokens.length} словоупотреблений.`);
  }
}