import { runStartCheck, classifyStartState, type StartCheckDeps, type StartState } from '@/lib/otaStartCheck';

const base: StartState = {
  isStartupProcedureRunning: true, isUpdateAvailable: false, isUpdatePending: false,
  isDownloading: false, restartCount: 0,
};

/** Nachbau des expo-updates-Zustands: `set` ändert ihn und benachrichtigt die Zuhörer. */
function store(initial: Partial<StartState> = {}) {
  let state: StartState = { ...base, ...initial };
  const listeners = new Set<(s: StartState) => void>();
  return {
    getState: () => state,
    subscribe: (l: (s: StartState) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    set: (patch: Partial<StartState>) => { state = { ...state, ...patch }; [...listeners].forEach(l => l(state)); },
    listenerCount: () => listeners.size,
  };
}

function deps(s: ReturnType<typeof store>, over: Partial<StartCheckDeps> = {}): StartCheckDeps & { isProtected: jest.Mock } {
  return {
    enabled: true,
    isProtected: jest.fn().mockResolvedValue(false),
    getState: s.getState,
    subscribe: s.subscribe,
    checkTimeoutMs: 50,
    fetchTimeoutMs: 80,
    ...over,
  } as never;
}
const tick = (ms = 0) => new Promise(res => setTimeout(res, ms));

describe('classifyStartState', () => {
  it('ordnet die Zustände ein', () => {
    expect(classifyStartState(base)).toBe('unknown');
    expect(classifyStartState({ ...base, isUpdateAvailable: true })).toBe('loading');
    expect(classifyStartState({ ...base, isDownloading: true })).toBe('loading');
    expect(classifyStartState({ ...base, isStartupProcedureRunning: false })).toBe('none');
    expect(classifyStartState({ ...base, isStartupProcedureRunning: false, isUpdateAvailable: true })).toBe('none');
    expect(classifyStartState({ ...base, isStartupProcedureRunning: false, isUpdatePending: true })).toBe('ready');
  });
});

describe('runStartCheck', () => {
  it('zeigt den Hinweis, sobald der Start-Download läuft, und lädt nach dem Laden neu', async () => {
    const s = store();
    const onFetching = jest.fn(); const onProgress = jest.fn();
    const run = runStartCheck(deps(s, { onFetching, onProgress }));
    await tick();
    s.set({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 0 });
    await tick();
    expect(onFetching).toHaveBeenCalledTimes(1);
    s.set({ downloadProgress: 0.5 });
    s.set({ isDownloading: false, isUpdatePending: true, isStartupProcedureRunning: false, downloadProgress: 1 });
    expect(await run).toBe('reload');
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(s.listenerCount()).toBe(0);
  });

  it('lädt neu, wenn die OTA beim Einhängen schon lädt (Zustand vor dem Anmelden geändert)', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const onFetching = jest.fn();
    const run = runStartCheck(deps(s, { onFetching }));
    await tick();
    expect(onFetching).toHaveBeenCalledTimes(1);
    s.set({ isUpdatePending: true, isDownloading: false });
    expect(await run).toBe('reload');
  });

  it('lädt sofort neu, wenn die OTA schon fertig geladen ist (ohne Hinweis)', async () => {
    const s = store({ isUpdatePending: true, isStartupProcedureRunning: false });
    const onFetching = jest.fn();
    expect(await runStartCheck(deps(s, { onFetching }))).toBe('reload');
    expect(onFetching).not.toHaveBeenCalled();
  });

  it('macht nichts, wenn Updates aus sind (Dev-Build, Notfallstart)', async () => {
    const s = store({ isUpdatePending: true });
    const d = deps(s, { enabled: false });
    expect(await runStartCheck(d)).toBe('continue');
    expect(d.isProtected).not.toHaveBeenCalled();
  });

  it('lädt nach einem Neustart in derselben Sitzung nie nochmals neu', async () => {
    const s = store({ isUpdatePending: true, restartCount: 1 });
    expect(await runStartCheck(deps(s))).toBe('continue');
  });

  it('schaut bei laufender oder unterbrochener Aufnahme gar nicht erst zu', async () => {
    const s = store({ isUpdatePending: true });
    const onFetching = jest.fn();
    expect(await runStartCheck(deps(s, { isProtected: jest.fn().mockResolvedValue(true), onFetching }))).toBe('continue');
    expect(onFetching).not.toHaveBeenCalled();
    expect(s.listenerCount()).toBe(0);
  });

  it('ohne neue OTA: startet normal, sobald die Start-Phase vorbei ist', async () => {
    const s = store();
    const run = runStartCheck(deps(s));
    await tick();
    s.set({ isStartupProcedureRunning: false });
    expect(await run).toBe('continue');
    expect(s.listenerCount()).toBe(0);
  });

  it('startet normal, wenn die Nachfrage beim Server zu lange dauert; später nur Hinweis', async () => {
    const s = store();
    const late = jest.fn();
    expect(await runStartCheck(deps(s), late)).toBe('continue');
    s.set({ isUpdateAvailable: true, isDownloading: true });
    expect(late).not.toHaveBeenCalled();
    s.set({ isUpdatePending: true, isDownloading: false, isStartupProcedureRunning: false });
    expect(late).toHaveBeenCalledWith('pending');
    expect(s.listenerCount()).toBe(0);
  });

  it('startet normal, wenn das Laden zu lange dauert; später nur Hinweis', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const late = jest.fn();
    expect(await runStartCheck(deps(s), late)).toBe('continue');
    expect(late).not.toHaveBeenCalled();
    s.set({ isUpdatePending: true, isDownloading: false });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('kein später Hinweis, wenn das Laden nach der Zeitgrenze scheitert', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const late = jest.fn();
    expect(await runStartCheck(deps(s), late)).toBe('continue');
    s.set({ isDownloading: false, isStartupProcedureRunning: false });
    expect(late).not.toHaveBeenCalled();
    expect(s.listenerCount()).toBe(0);
  });

  it('startet normal, wenn das Laden scheitert (Start-Phase endet ohne geladene OTA)', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const run = runStartCheck(deps(s));
    await tick();
    s.set({ isDownloading: false, isStartupProcedureRunning: false });
    expect(await run).toBe('continue');
  });

  it('lädt nicht neu, wenn während des Ladens eine Aufnahme begonnen hat (nur Hinweis)', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const isProtected = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const run = runStartCheck(deps(s, { isProtected }));
    await tick();
    s.set({ isUpdatePending: true, isDownloading: false });
    expect(await run).toBe('pending');
    expect(isProtected).toHaveBeenCalledTimes(2);
  });

  it('hängende Schutzprüfung gilt als geschützt', async () => {
    const s = store({ isUpdatePending: true });
    expect(await runStartCheck(deps(s, { isProtected: () => new Promise<boolean>(() => {}) }))).toBe('continue');
  });

  it('wirft nie: Fehler im Zustand → normal starten', async () => {
    const s = store();
    expect(await runStartCheck(deps(s, { getState: () => { throw new Error('x'); } }))).toBe('continue');
  });

  it('begrenzt den Fortschritt auf 0..1', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 1.7 });
    const onProgress = jest.fn();
    const run = runStartCheck(deps(s, { onProgress }));
    await tick();
    s.set({ isUpdatePending: true });
    await run;
    expect(onProgress).toHaveBeenCalledWith(1);
  });
});
