import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TextProcessorService {
  // Убран \b и добавлен флаг 'u' (Unicode)
  private patterns: Record<string, RegExp> = {
    ru: /[а-яё]+(?:-[а-яё]+)*/gu,
    en: /[a-z]+(?:['\-][a-z]+)*/gu,
    et: /[a-zõäöüšž]+(?:['\-][a-zõäöüšž]+)*/gu
  };

  tokenize(text: string, lang: string): string[] {
    const pattern = this.patterns[lang] || this.patterns['en'];
    // Сбрасываем индекс глобального поиска
    pattern.lastIndex = 0;
    return text.toLowerCase().match(pattern) || [];
  }
}