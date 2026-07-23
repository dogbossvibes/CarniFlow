import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PLAN_META, PRODUCT_IDS, normalizeSubscriptionPlan, type SubscriptionPlan,
} from '@/features/subscription/plans';

// Statische Sicherheitsprüfungen der Abo-Umstellung beginner_trial → newbie.
// Kein DB-Zugriff: die Migration wird als Text geprüft (Struktur/Garantien),
// die Normalisierung als reine Funktion.

describe('SUBSCRIPTION_NEWBIE_MIGRATION.sql — Garantien', () => {
  const sql = readFileSync(join(process.cwd(), 'SUBSCRIPTION_NEWBIE_MIGRATION.sql'), 'utf8').toLowerCase();

  it('ist transaktional (begin/commit)', () => {
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });
  it('erlaubt vorübergehend BEIDE Werte (idempotent bei erneutem Lauf)', () => {
    expect(sql).toMatch(/plan in \([^)]*'beginner_trial'[^)]*'newbie'[^)]*\)/);
  });
  it('migriert beginner_trial → newbie per UPDATE', () => {
    expect(sql).toMatch(/update\s+public\.subscriptions\s+set\s+plan\s*=\s*'newbie'\s+where\s+plan\s*=\s*'beginner_trial'/);
  });
  it('finaler CHECK enthält newbie + Bestandswerte, aber NICHT beginner_trial', () => {
    // Nur die aktive Migration prüfen (bis zum ersten commit) — Verifikations-/
    // Rollback-Blöcke sind auskommentiert und dürfen das Ergebnis nicht verfälschen.
    const migration = sql.slice(0, sql.indexOf('commit;'));
    const finalCheck = migration.slice(migration.lastIndexOf('add constraint'));
    expect(finalCheck).toContain("'newbie'");
    expect(finalCheck).toContain("'founder_active'");
    expect(finalCheck).toContain("'active'");
    expect(finalCheck).toContain("'trainer'");
    expect(finalCheck).not.toContain("'beginner_trial'");
  });
  it('löscht/benennt KEINE Tabelle (keine Datenverluste)', () => {
    expect(sql).not.toMatch(/drop\s+table/);
    expect(sql).not.toMatch(/alter\s+table\s+public\.subscriptions\s+rename/);
  });
  it('verändert NUR die subscriptions-Tabelle', () => {
    const alters = sql.match(/alter\s+table\s+(\S+)/g) ?? [];
    for (const a of alters) expect(a).toContain('public.subscriptions');
  });
});

describe('Plan-Oberfläche enthält kein „beginner" mehr', () => {
  it('PLAN_META-Schlüssel sind newbie/active/founder_active/trainer', () => {
    expect(Object.keys(PLAN_META).sort()).toEqual(['active', 'founder_active', 'newbie', 'trainer']);
    expect(Object.keys(PLAN_META)).not.toContain('beginner_trial');
  });
  it('keine Product-ID heißt „beginner"', () => {
    for (const id of Object.values(PRODUCT_IDS)) expect(id).not.toMatch(/beginner/i);
    expect(PRODUCT_IDS.newbieMonthly).toBe('anyvo_newbie_monthly_0');
  });
  it('Normalisierung: Altwert lesbar, aber auf newbie abgebildet', () => {
    const plans: SubscriptionPlan[] = ['newbie', 'active', 'founder_active', 'trainer'];
    expect(normalizeSubscriptionPlan('beginner_trial')).toBe('newbie');
    for (const p of plans) expect(normalizeSubscriptionPlan(p)).toBe(p);
    expect(normalizeSubscriptionPlan('irgendwas')).toBeNull();
  });
});
