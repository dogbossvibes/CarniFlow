jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import { ALL_QUICK_ACTIONS, HOME_QUICK_ACTIONS_META } from '@/stores/homeScreenConfig';

// Sicherheits-Guards: das Trainingstagebuch darf KEINE zweite Datenquelle, keine
// neue Session-Tabelle und keine Migration einführen. Alles läuft über den
// bestehenden vereinheitlichten Feed (Single Source of Truth).

describe('33-36) Trainingstagebuch führt keine neue Persistenz/Logik ein', () => {
  const logic = readFileSync('features/training/journal.ts', 'utf8');
  const screen = readFileSync('app/training-journal.tsx', 'utf8');

  it('33) Logikmodul spricht weder Supabase noch AsyncStorage an (keine neue Persistenz)', () => {
    expect(logic).not.toMatch(/@\/lib\/supabase/);
    expect(logic).not.toMatch(/async-storage/i);
    expect(logic).not.toMatch(/supabase\.from\(/);
    // Bezieht seinen Typ ausschliesslich aus dem bestehenden vereinheitlichten Feed.
    expect(logic).toMatch(/@\/services\/trainingFeed/);
  });

  it('34) Screen nutzt den bestehenden Feed-Hook als einzige Datenquelle', () => {
    expect(screen).toMatch(/useTrainingFeed/);
    expect(screen).not.toMatch(/@\/lib\/supabase/);
    expect(screen).not.toMatch(/getTrainingUnits|getTrainingSessions|addTrainingSession|deleteTraining/);
  });

  it('35) Screen ändert keine Tracking-/Fährtenlogik (nur Lese-Navigation zu Details)', () => {
    expect(screen).not.toMatch(/trackService|activeFaehrten|deleteTrackSession|finishTrainingUnit/);
  });

  it('36) Screen enthält keine Abo-/RevenueCat-Logik', () => {
    expect(screen).not.toMatch(/purchases|revenuecat|quota|claimNewbie|configurePurchases/i);
  });
});

describe('Home-Schnellaktion registriert (opt-in, nicht erzwungen)', () => {
  it('24) training_journal ist wählbare Schnellaktion mit Route /training-journal', () => {
    expect(ALL_QUICK_ACTIONS).toContain('training_journal');
    expect(HOME_QUICK_ACTIONS_META.training_journal.route).toBe('/training-journal');
  });
  it('nicht in einer erzwungenen Default-Auswahl (Nutzer aktiviert selbst)', () => {
    // Default-Config wird an anderer Stelle getestet; hier nur: Aktion existiert zusätzlich,
    // ohne bestehende zu ersetzen.
    expect(ALL_QUICK_ACTIONS.filter(a => a === 'training_journal')).toHaveLength(1);
  });
});
