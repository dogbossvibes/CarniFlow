import { readFileSync } from 'fs';
import { join } from 'path';

// BUGFIX-Regressionsschutz: Die Bottom-Navigation bleibt für ALLE Pläne stabil
// (Start · Hunde · Training · Analyse · Profil). Der Trainer-Hub darf den
// Analyse-Tab nie ersetzen/ausblenden/umbenennen; er ist additiv nur über das
// Profil erreichbar. Wir prüfen die Quelle von app/(tabs)/_layout.tsx direkt
// (gleiche Strategie wie components/home/__tests__/DogBackpackWidget.test.ts),
// da ein vollständiges Rendern des Tab-Navigators hier zu viel Infrastruktur
// (expo-router Tabs, Session, Notifications, Purchases) bräuchte.
const layoutSrc = readFileSync(
  join(__dirname, '..', '_layout.tsx'),
  'utf8',
);
const profileSrc = readFileSync(
  join(__dirname, '..', 'profile.tsx'),
  'utf8',
);
const rootLayoutSrc = readFileSync(
  join(__dirname, '..', '..', '_layout.tsx'),
  'utf8',
);
const hubModalSrc = readFileSync(
  join(__dirname, '..', '..', 'trainer-hub.tsx'),
  'utf8',
);

describe('Bottom-Navigation (Analyse fest, Hub additiv)', () => {
  it('koppelt keinen Tab mehr an isTrainerModule (keine gegenseitige Exklusion)', () => {
    expect(layoutSrc).not.toMatch(/isTrainerModule\s*\?\s*null\s*:\s*undefined/);
    expect(layoutSrc).not.toMatch(/isTrainerModule\s*\?\s*undefined\s*:\s*null/);
    expect(layoutSrc).not.toContain('isTrainerModule');
  });

  it('Analyse ist ein fester Kern-Tab ohne href-Gating', () => {
    const analytics = layoutSrc.match(/name="analytics"[\s\S]*?\/>/)?.[0] ?? '';
    expect(analytics).toContain("title: 'Analyse'");
    expect(analytics).not.toContain('href');
  });

  it('Hub ist KEIN Tab mehr (nicht im Tab-Navigator registriert)', () => {
    expect(layoutSrc).not.toContain('name="hub"');
  });

  it('behält genau die fünf Kern-Tabs (mit href) bei', () => {
    // Sichtbare Tabs = Screens, die NICHT href:null gesetzt haben und kein
    // Feature-Flag-Gate tragen. Wir prüfen die erwarteten Titel positiv.
    for (const title of ['Start', 'Hunde', 'Training', 'Analyse', 'Profil']) {
      expect(layoutSrc).toContain(`title: '${title}'`);
    }
  });
});

describe('Trainer-Hub-Einstieg im Profil (additiv, echte Capability)', () => {
  it('zeigt den Trainer-Hub-Eintrag nur bei isTrainerModule und öffnet die Modal-Route', () => {
    expect(profileSrc).toContain('isTrainerModule');
    expect(profileSrc).toMatch(/isTrainerModule\s*\?/);
    expect(profileSrc).toMatch(/router\.push\('\/trainer-hub'\)/);
    expect(profileSrc).toContain("t('profile.trainerHub')");
  });
});

describe('Trainer-Hub als Fullscreen-Modal mit sicherer Rücknavigation', () => {
  it('ist im Root-Stack als fullScreenModal registriert', () => {
    expect(rootLayoutSrc).toMatch(/name="trainer-hub"[\s\S]*?presentation:\s*'fullScreenModal'/);
  });

  it('gated auf echte Trainer-Capability (Redirect statt Inhalt), Loading zeigt nur den Rahmen', () => {
    expect(hubModalSrc).toContain('useCapabilities');
    expect(hubModalSrc).toMatch(/loading\s*\?\s*null\s*:/);
    expect(hubModalSrc).toMatch(/!isTrainerModule[\s\S]*?<Redirect\s+href="\/\(tabs\)\/analytics"/);
  });

  it('rendert den Zurück-Button immer, auch während Capabilities laden (kein Festsitzen)', () => {
    // Der Close-Button steht im JSX VOR dem Loading-/Capability-Gate, wird also
    // unbedingt gerendert — sonst bliebe man im Fullscreen-Modal ohne Rückweg.
    const closeIdx = hubModalSrc.indexOf('testID="trainer-hub-close"');
    const loadingGateIdx = hubModalSrc.indexOf('loading ?');
    expect(closeIdx).toBeGreaterThanOrEqual(0);
    expect(loadingGateIdx).toBeGreaterThan(closeIdx);
  });

  it('platziert den Header explizit unter der Safe Area (insets.top statt SafeAreaView)', () => {
    // Gleiches Muster wie die übrigen Fullscreen-Modal-Screens (track/legen.tsx):
    // eigener Header mit paddingTop = insets.top + 8 — nie über Uhr/Statusleiste.
    expect(hubModalSrc).toContain('useSafeAreaInsets');
    expect(hubModalSrc).toMatch(/paddingTop:\s*insets\.top\s*\+\s*8/);
    expect(hubModalSrc).not.toContain('<SafeAreaView');
    expect(hubModalSrc).toMatch(/borderRadius:\s*22/);
  });

  it('schließt sicher: back mit History, sonst Fallback auf Analyse', () => {
    expect(hubModalSrc).toMatch(/canGoBack\(\)[\s\S]*?router\.back\(\)[\s\S]*?router\.replace\('\/\(tabs\)\/analytics'\)/);
    expect(hubModalSrc).toContain('testID="trainer-hub-close"');
  });
});
