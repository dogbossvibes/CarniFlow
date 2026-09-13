/**
 * Verdrahtung des Retry-Pfads: App-Start + Vordergrund (SyncProvider) und
 * Track-Open (Detail-Screen) nehmen fehlgeschlagene Queue-Items wieder auf.
 * Statisches Quell-Muster (SyncProvider/Detail-Screen sind ohne AppState-/
 * Router-Harness nicht sinnvoll renderbar).
 */
import { readFileSync } from 'fs';

describe('SyncProvider', () => {
  const src = readFileSync('features/sync/components/SyncProvider.tsx', 'utf8');
  it('App-Start und Vordergrund → retryFailedSync (failed → pending + syncNow); Reconnect bleibt syncNow', () => {
    expect(src).toContain("import { syncNow, retryFailedSync, updateSyncCounts } from '@/features/sync/services/syncEngine';");
    expect(src).toContain('(retryFailed ? retryFailedSync() : syncNow()).catch(() => {});');
    expect(src).toContain('if (useSyncStore.getState().isOnline) triggerSync(800, true);');
    expect(src).toContain("if (s === 'active' && useSyncStore.getState().isOnline) triggerSync(1000, true);");
    expect(src).toContain('if (!wasOnline.current && online) triggerSync();');
  });
  it('genau ein Retry je Auslöser (debounced, kein Intervall/Loop)', () => {
    expect(src).not.toMatch(/setInterval/);
    expect(src).toContain('if (debounce.current) clearTimeout(debounce.current);');
  });
});

describe('Detail-Screen Track-Open', () => {
  const src = readFileSync('app/track/[id].tsx', 'utf8');
  it('öffnet Retry über retryFailedSyncForSession(id), nicht blockierend', () => {
    expect(src).toContain("import { retryFailedSyncForSession } from '@/features/sync/services/syncEngine';");
    expect(src).toContain('void retryFailedSyncForSession(id).catch(() => {});');
  });
});

describe('Smart Coach Wording', () => {
  it('de-CH/gsw-CH: Trainings-Zusammenfassung statt „KI"; EN/FR/IT unverändert ohne KI', () => {
    expect(readFileSync('i18n/de-CH.ts', 'utf8')).toContain("'analyse.optionalSummary': 'Optionale Trainings-Zusammenfassung',");
    expect(readFileSync('i18n/gsw-CH.ts', 'utf8')).toContain("'analyse.optionalSummary': 'Optionali Trainings-Zämefassig',");
    for (const f of ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']) {
      const line = readFileSync(f, 'utf8').split('\n').find(l => l.includes('analyse.optionalSummary')) ?? '';
      expect(line).not.toMatch(/\bKI\b|\bAI\b|\bIA\b/);
    }
    expect(readFileSync('i18n/de-CH.ts', 'utf8')).toContain("'analyse.summaryIntro': 'Erstellt auf Wunsch eine zusätzliche Text-Zusammenfassung deiner Trainings.");
  });
  it('Hook-Kommentar nennt kein LLM mehr; Erzeuger bleibt regelbasiert', () => {
    const hook = readFileSync('features/ai/hooks/useCoachSummary.ts', 'utf8');
    expect(hook).not.toContain('LLM-Kosten');
    expect(hook).toContain('KEIN LLM, keine externe API');
    const svc = readFileSync('features/ai/services/insightService.ts', 'utf8');
    expect(svc).toContain('Regelbasierte Zusammenfassung (KEIN LLM, keine externe API)');
    expect(svc).not.toMatch(/functions\.invoke|api\.openai|generativelanguage/);
  });
});
