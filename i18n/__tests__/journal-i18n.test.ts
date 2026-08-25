import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

const journalKeys = Object.keys(deCH).filter(k => k.startsWith('journal.'));
const extra = ['home.actionTrainingJournal'];

describe('Trainingstagebuch-i18n', () => {
  it('29) deckt die geforderten Journal-Keys ab', () => {
    for (const k of [
      'journal.title', 'journal.subtitle', 'journal.thisYear', 'journal.group.today',
      'journal.group.yesterday', 'journal.group.week', 'journal.search', 'journal.filterDog',
      'journal.filterDiscipline', 'journal.filterPeriod', 'journal.loadMore', 'journal.emptyTitle',
      'journal.emptyCta', 'journal.noMatchTitle', 'journal.resetFilters', 'journal.openAnalysis',
      'journal.allTrainings',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(deCH, k)).toBe(true);
    }
  });

  it('29) DE: alle Journal-Keys nicht leer', () => {
    for (const k of [...journalKeys, ...extra]) {
      expect(String((deCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('30) gsw: exakt dieselben Keys, nicht leer', () => {
    for (const k of [...journalKeys, ...extra]) {
      expect(Object.prototype.hasOwnProperty.call(gswCH, k)).toBe(true);
      expect(String((gswCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('31) FR: alle Keys vorhanden, nicht leer', () => {
    for (const k of [...journalKeys, ...extra]) {
      expect(Object.prototype.hasOwnProperty.call(fr, k)).toBe(true);
      expect(String((fr as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('32) sichtbare Labels laufen über t(...), keine roh gerenderten Keys', () => {
    const src = readFileSync('app/training-journal.tsx', 'utf8');
    expect(src).toMatch(/t\('journal\.title'\)/);
    expect(src).toMatch(/t\('journal\.emptyTitle'\)/);
    // Kein Translation-Key direkt als JSX-Textknoten (z. B. „>journal.title").
    expect(src).not.toMatch(/>\s*journal\./);
  });

  it('IT und EN decken Journal-Keys ab', () => {
    const journalKeys = Object.keys(deCH).filter(k => k.startsWith('journal.'));
    for (const k of journalKeys) {
      expect(String((itLocale as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
      expect(String((en as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});
