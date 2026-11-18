import { runStartCheck, type StartCheckDeps } from '@/lib/otaStartCheck';

function deps(over: Partial<StartCheckDeps> = {}): StartCheckDeps & { fetch: jest.Mock; check: jest.Mock; isProtected: jest.Mock } {
  return {
    enabled: true,
    isProtected: jest.fn().mockResolvedValue(false),
    check: jest.fn().mockResolvedValue({ isAvailable: true }),
    fetch: jest.fn().mockResolvedValue({ isNew: true }),
    checkTimeoutMs: 50,
    fetchTimeoutMs: 80,
    ...over,
  } as never;
}
const never = () => new Promise<never>(() => {});

describe('runStartCheck', () => {
  it('lädt neu, wenn eine neue OTA geladen wurde und nichts läuft', async () => {
    const onFetching = jest.fn();
    expect(await runStartCheck(deps({ onFetching }))).toBe('reload');
    expect(onFetching).toHaveBeenCalledTimes(1);
  });

  it('macht nichts, wenn Updates aus sind (Dev-Build, Notfallstart)', async () => {
    const d = deps({ enabled: false });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.check).not.toHaveBeenCalled();
  });

  it('fragt bei laufender oder unterbrochener Aufnahme gar nicht erst nach', async () => {
    const d = deps({ isProtected: jest.fn().mockResolvedValue(true) });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.check).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('lädt nicht neu, wenn während des Ladens eine Aufnahme beginnt (nur Hinweis)', async () => {
    const isProtected = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await runStartCheck(deps({ isProtected }))).toBe('pending');
  });

  it('startet normal ohne neue OTA', async () => {
    const d = deps({ check: jest.fn().mockResolvedValue({ isAvailable: false }) });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('startet normal, wenn die Nachfrage zu lange dauert (kein Netz)', async () => {
    const d = deps({ check: jest.fn(never) });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('startet normal bei Fehlern', async () => {
    expect(await runStartCheck(deps({ check: jest.fn().mockRejectedValue(new Error('offline')) }))).toBe('continue');
    expect(await runStartCheck(deps({ fetch: jest.fn().mockRejectedValue(new Error('x')) }))).toBe('continue');
    expect(await runStartCheck(deps({ isProtected: jest.fn().mockRejectedValue(new Error('x')) }))).toBe('continue');
  });

  it('startet normal, wenn das Laden nichts Neues bringt', async () => {
    expect(await runStartCheck(deps({ fetch: jest.fn().mockResolvedValue({ isNew: false }) }))).toBe('continue');
  });

  it('nach Ablauf der Ladezeit: normal starten, später nur Hinweis statt Neustart', async () => {
    let finish!: (v: { isNew: boolean }) => void;
    const fetch = jest.fn(() => new Promise<{ isNew: boolean }>(r => { finish = r; }));
    const late = jest.fn();
    expect(await runStartCheck(deps({ fetch }), late)).toBe('continue');
    expect(late).not.toHaveBeenCalled();
    finish({ isNew: true });
    await new Promise(r => setTimeout(r, 0));
    expect(late).toHaveBeenCalledWith('pending');
  });

  it('hängt die Schutzprüfung, startet die App normal (kein Neustart, kein Hänger)', async () => {
    const d = deps({ isProtected: jest.fn(never) });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.check).not.toHaveBeenCalled();
  });
});
