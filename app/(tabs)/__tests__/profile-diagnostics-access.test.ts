/**
 * Profil: interner Diagnose-Bereich — statische Verdrahtung, kein Kunden-Leak,
 * keine E-Mail/UUID im Bundle, profiles.role nicht als Gate, Support-Bereich unverändert.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const profile = strip(read('app/(tabs)/profile.tsx'));
const devScreen = strip(read('app/dev/precision-location-test.tsx'));
const hook = strip(read('hooks/useDiagnosticsAccess.ts'));
const gate = strip(read('components/DiagnosticsRouteGate.tsx'));

describe('Profil — Entwickler & Diagnose', () => {
  it('1./2. Bereich wird NUR bei diagnosticsAccess.allowed gerendert; kein unbedingter Diagnose-Eintrag mehr', () => {
    const idx = profile.indexOf("{diagnosticsAccess.allowed && (");
    expect(idx).toBeGreaterThan(-1);
    const block = profile.slice(idx, profile.indexOf("t('profile.secSupport')"));
    expect(block).toContain("t('profile.secDiagnostics')");
    expect(block).toContain("router.push('/dev/precision-location-test' as never)");
    expect(block).toContain("t('profile.trackDiagnostics')");
    // Genau EIN Navigationsziel zur Diagnose-Route — und es liegt im gegateten Block.
    expect((profile.match(/\/dev\/precision-location-test/g) ?? []).length).toBe(1);
    expect(profile).toContain('const diagnosticsAccess = useDiagnosticsAccess();');
  });
  it('9. Support-Bereich unverändert (Help-Center, Hilfe, Feedback, AGB, Datenschutz, danach Abmelden-Handler vorhanden)', () => {
    const sup = profile.slice(profile.indexOf("t('profile.secSupport')"));
    for (const k of ["'/help-center'", "'/help'", 'mailto:', "'/terms'", "'/privacy'"]) expect(sup).toContain(k);
    expect(profile).toContain('const handleAbmelden = ');
    // Der Diagnose-Bereich steht oberhalb von Support.
    expect(profile.indexOf("t('profile.secDiagnostics')")).toBeLessThan(profile.indexOf("t('profile.secSupport')"));
  });
  it('7. keine E-Mail-/UUID-Zuordnung im Produktcode', () => {
    for (const src of [profile, devScreen, hook, gate]) {
      expect(src).not.toMatch(/einfachich503@gmail\.com/);
      expect(src).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });
  it('8. Authority = profiles.is_internal_tester (Trigger-geschützt); profiles.role ist KEIN Gate', () => {
    expect(hook).toContain("import { useProfile } from '@/hooks/useProfile';");
    expect(hook).toContain('internalTesterStatusFromProfile(profile)');
    expect(hook).not.toMatch(/\.role\b|__DEV__|@gmail|process\.env/);
    expect(gate).not.toMatch(/\.role\b|__DEV__/);
    expect(profile).not.toMatch(/role === 'admin'/);
  });
  it('5./6. Route-Gate: Dev-Screen rendert nur innerhalb DiagnosticsRouteGate; Gate leitet Unberechtigte ins Profil', () => {
    expect(devScreen).toContain('<DiagnosticsRouteGate>');
    expect(devScreen).toContain('<PrecisionLocationTestContent />');
    expect(gate).toContain("if (!loading && !allowed) router.replace('/(tabs)/profile' as never);");
    expect(gate).toContain('if (!allowed) return <View');
  });
  it('Route-Gate und Profil-Gate: dieselbe zentrale Regel (useDiagnosticsAccess), explizite Allowlist', () => {
    expect(profile).toContain("from \"@/hooks/useDiagnosticsAccess\"");
    expect(gate).toContain("from '@/hooks/useDiagnosticsAccess'");
    expect(hook).toContain("export const DIAGNOSTICS_TESTER_LEVELS: readonly TesterLevel[] = ['developer', 'qa', 'admin'];");
    expect(hook).not.toMatch(/level !== 'trainer'/);
  });
  it('i18n: neuer Abschnittstitel in allen 5 Sprachen', () => {
    for (const f of ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']) {
      expect(read(f)).toMatch(/['"]profile\.secDiagnostics['"]\s*:/);
    }
  });
});
