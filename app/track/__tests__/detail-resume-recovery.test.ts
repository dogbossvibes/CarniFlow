// Root Cause „gelegte Fährte verschwindet aus Fortsetzen": Das Öffnen einer
// Journal-Fährte (/track/[id]) leerte den Aufnahme-Store samt Pending-Puffer und
// entfernte den Registry-Eintrag des Hundes bedingungslos. Diese Pins halten die
// Korrektur fest und belegen, dass der Detail-Screen weder Session noch Quota erzeugt.
import { readFileSync } from 'fs';
import { join } from 'path';

const detail = readFileSync(join(__dirname, '..', '[id].tsx'), 'utf8');
const layout = readFileSync(join(__dirname, '..', '..', '_layout.tsx'), 'utf8');

describe('Track-Detail: Lifecycle schützt liegende Fährten', () => {
  it('reset() nur, wenn der Store KEINE offene Fährte mit Daten hält', () => {
    expect(detail).toContain('const holdsOpenTrack = isOpenStatus(st.sessionStatus) && (st.trackPoints.length > 0 || st.isRecording);');
    expect(detail).toContain('if (!holdsOpenTrack) st.reset();');
    expect(detail).not.toContain('useTrackingStore.getState().reset();   // Flow abgeschlossen');
  });

  it('Registry-Eintrag wird nur für DIESE, tatsächlich abgesuchte Session entfernt', () => {
    expect(detail).toContain('const searched = hasFinalSearchRun(d);');
    expect(detail).toContain('if (d.dog_id && reg?.sessionId === String(id) && searched) useActiveFaehrten.getState().remove(d.dog_id);');
    expect(detail).not.toMatch(/if \(d\.dog_id\) useActiveFaehrten\.getState\(\)\.remove\(d\.dog_id\);/);
  });

  it('Recovery-Karte direkt unter dem Header; gesperrt nur durch einen FINALEN Suchlauf', () => {
    expect(detail).toContain('const canOfferResume = !hasFinalSearchRun(data);');
    expect(detail).toContain('<TrackResumeCta sessionId={String(id)} dogId={data.dog_id} hasRemoteSearchRun={!canOfferResume} onVisibleChange={setRecoveryCardVisible} />');
    const scroll = detail.indexOf('<ScrollView contentContainerStyle={s.content}');
    const card = detail.indexOf('<TrackResumeCta ');
    const hero = detail.indexOf('<View style={[s.card, s.cardGlow, s.hero]}>');
    expect(scroll).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(scroll);
    expect(card).toBeLessThan(hero);   // vor allem anderen Inhalt
  });

  it('Recovery-Karte hängt NICHT am Analyse-Zustand', () => {
    const line = detail.split('\n').find(l => l.includes('const canOfferResume'))!;
    expect(line).not.toContain('analysisState');
    expect(detail).not.toMatch(/analysisState === 'pending_search' && \(\s*<TrackResumeCta/);
  });

  it('der irreführende Hinweis „keine verwertbare Suchspur aufgezeichnet" weicht der Recovery-Karte', () => {
    expect(detail).toMatch(/\{!recoveryCardVisible && \(<>\s*\{availability\.showNoSearchTrackWarning && \(/);
  });

  it('Detail erzeugt weder Session noch Quota-Claim', () => {
    expect(detail).not.toMatch(/claimNewbieQuota|createLocalTrainingSession|startRecording\(/);
  });
});

describe('App-Start: Selbstheilung nur mit Session + Hunden', () => {
  it('Modulebene hydratisiert nur die Registry — keine globale Heilung aller Pending-Slots', () => {
    expect(layout).toContain('void useActiveFaehrten.getState().hydrate();');
    expect(layout).not.toContain('healActiveFaehrtenFromPending');
  });

  it('Heilung als Komponente innerhalb des SessionProvider', () => {
    const start = layout.indexOf('<SessionProvider>');
    const heal = layout.indexOf('<ActiveFaehrtenSelfHeal />');
    expect(start).toBeGreaterThan(-1);
    expect(heal).toBeGreaterThan(start);
    expect(heal).toBeLessThan(layout.indexOf('</SessionProvider>'));
  });
});

describe('Bewusster Abbruch wird dauerhaft vermerkt', () => {
  const liegen = readFileSync(join(__dirname, '..', 'liegen.tsx'), 'utf8');
  const legen = readFileSync(join(__dirname, '..', 'legen.tsx'), 'utf8');

  it('Liegezeit „Fährte abbrechen": Marker nach Status/Registry, nicht awaited', () => {
    const cancel = liegen.indexOf("setSessionStatus('cancelled')");
    const marker = liegen.indexOf('void recordTrackCancelled(id ?? useTrackingStore.getState().currentSessionId, dogId ?? useTrackingStore.getState().dogId);');
    expect(cancel).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(cancel);
  });

  it('Konflikt-Dialog „Fährte abbrechen" beim Legen vermerkt den Abbruch der bestehenden Fährte', () => {
    expect(legen).toContain('void recordTrackCancelled(entry.sessionId, dId);');
  });
});

describe('run.tsx „Absuche verwerfen": nur der Suchversuch, kein Abbruch der Fährte', () => {
  const run = readFileSync(join(__dirname, '..', 'run.tsx'), 'utf8');
  const discard = run.slice(run.indexOf('const discardSearch'), run.indexOf('const runPoints'));

  it('ruft discardSearchAttempt, setzt NICHT cancelled und entfernt die Fährte nicht aus der Registry', () => {
    expect(discard).toContain('const released = await discardSearchAttempt(sessId, dogId ?? pending.dogId ?? null);');
    expect(discard).not.toContain("setSessionStatus('cancelled')");
    expect(discard).not.toContain('clearRegistry()');
    expect(discard).not.toMatch(/recordTrackCancelled|setLocalTrackLifecycle/);
  });

  it('zurück in die Liegezeit; Fallback ohne Freigabe bleibt lokal resting', () => {
    expect(discard).toContain('if (released.ok) setPendingExit(released.target);');
    expect(discard).toContain('if (!released.ok) useTrackingStore.getState().clearSearchSession();');
  });

  it('echtes „Fährte abbrechen" (Liegezeit) bleibt cancelled + dauerhafter Marker', () => {
    const liegen = readFileSync(join(__dirname, '..', 'liegen.tsx'), 'utf8');
    expect(liegen).toContain("useTrackingStore.getState().setSessionStatus('cancelled');");
    expect(liegen).toContain('void recordTrackCancelled(');
  });
});
