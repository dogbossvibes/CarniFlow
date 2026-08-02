import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';

const dashKeys = Object.keys(deCH).filter(k => k.startsWith('dash.'));
const backpackAdditions = ['backpack.allReady', 'backpack.nonePacked', 'backpack.activeItems'];
const allKeys = [...dashKeys, ...backpackAdditions];

describe('Dashboard-i18n (Phase C)', () => {
  it('33) deckt die geforderten Dashboard-Keys ab', () => {
    for (const k of [
      'dash.todayWith', 'dash.nothingToday', 'dash.appointments', 'dash.noAppointments',
      'dash.overdue', 'dash.today', 'dash.tomorrow', 'dash.currentGoal', 'dash.recent',
      'dash.lastTraining', 'dash.lastFaehrte', 'dash.allInJournal', 'dash.trainingsThisWeek',
      'dash.noTraining', 'dash.noFaehrte', 'dash.status',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(deCH, k)).toBe(true);
    }
  });

  it('33) DE: alle Keys nicht leer', () => {
    for (const k of allKeys) {
      expect(String((deCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('34) gsw: exakt dieselben Keys, nicht leer', () => {
    for (const k of allKeys) {
      expect(Object.prototype.hasOwnProperty.call(gswCH, k)).toBe(true);
      expect(String((gswCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('35) FR: alle Keys vorhanden, nicht leer', () => {
    for (const k of allKeys) {
      expect(Object.prototype.hasOwnProperty.call(fr, k)).toBe(true);
      expect(String((fr as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('36) Dashboard-Komponenten: sichtbare Texte via t(...), keine roh gerenderten Keys', () => {
    for (const path of [
      'components/dogs/DogTodayCard.tsx',
      'components/dogs/DogAppointmentsCard.tsx',
      'components/dogs/DogRecentCard.tsx',
      'components/dogs/DogStatusTiles.tsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      expect(src).not.toMatch(/>\s*dash\./);
    }
  });

  it('keine EN-/IT-Locale-Dateien angelegt', () => {
    for (const path of ['i18n/locales/en.ts', 'i18n/locales/it.ts']) {
      let exists = true;
      try { readFileSync(path, 'utf8'); } catch { exists = false; }
      expect(exists).toBe(false);
    }
  });
});
