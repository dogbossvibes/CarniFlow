import { runStartCheck, runStartCheckDetailed, classifyStartState, type StartCheckDeps, type StartState } from '@/lib/otaStartCheck';

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
    isProtected: jest.fn().mockResolvedValue(null),
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
    expect(await runStartCheck(deps(s, { isProtected: jest.fn().mockResolvedValue({ reason: 'laying_searching' }), onFetching }))).toBe('continue');
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
    const isProtected = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ reason: 'location_task' });
    const run = runStartCheck(deps(s, { isProtected }));
    await tick();
    s.set({ isUpdatePending: true, isDownloading: false });
    expect(await run).toBe('pending');
    expect(isProtected).toHaveBeenCalledTimes(2);
  });

  it('hängende Schutzprüfung gilt als geschützt', async () => {
    const s = store({ isUpdatePending: true });
    expect(await runStartCheck(deps(s, { isProtected: () => new Promise<never>(() => {}) }))).toBe('continue');
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

describe('runStartCheckDetailed: Grund der Entscheidung (Diagnose)', () => {
  const clock = () => { let t = 1000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

  it('disabled: Updates aus', async () => {
    const r = await runStartCheckDetailed(deps(store(), { enabled: false }));
    expect(r).toMatchObject({ outcome: 'continue', reason: 'disabled' });
    expect(r.protection).toBeUndefined();
  });

  it('restarted: JS wurde schon neu geladen', async () => {
    expect(await runStartCheckDetailed(deps(store({ isUpdatePending: true, restartCount: 2 }))))
      .toMatchObject({ outcome: 'continue', reason: 'restarted' });
  });

  it.each(['background', 'location_task', 'laying_searching', 'pending_buffer', 'error'] as const)(
    'protected:%s übernimmt die gemeldete Schutzbedingung samt Detail', async reason => {
      const s = store({ isUpdatePending: true });
      const r = await runStartCheckDetailed(deps(s, { isProtected: jest.fn().mockResolvedValue({ reason, detail: '1×cancelled·3d' }) }));
      expect(r).toMatchObject({ outcome: 'continue', reason: 'protected', protection: { reason, detail: '1×cancelled·3d' } });
      expect(s.listenerCount()).toBe(0);
    });

  it('protected:timeout bei hängender Schutzprüfung', async () => {
    const r = await runStartCheckDetailed(deps(store({ isUpdatePending: true }), { isProtected: () => new Promise<never>(() => {}) }));
    expect(r).toMatchObject({ outcome: 'continue', reason: 'protected', protection: { reason: 'timeout' } });
  });

  it('protected:timeout auch bei werfender Schutzprüfung (bleibt geschützt)', async () => {
    const r = await runStartCheckDetailed(deps(store({ isUpdatePending: true }), { isProtected: () => Promise.reject(new Error('x')) }));
    expect(r).toMatchObject({ outcome: 'continue', reason: 'protected', protection: { reason: 'timeout' } });
  });

  it('check_timeout, später fertig geladen: onLate meldet Phase und Dauer, Hinweis wie bisher', async () => {
    const c = clock();
    const s = store();
    const onLate = jest.fn(); const late = jest.fn();
    const r = await runStartCheckDetailed(deps(s, { onLate, now: c.now }), late);
    expect(r).toMatchObject({ outcome: 'continue', reason: 'check_timeout' });
    c.advance(4200);
    s.set({ isUpdateAvailable: true, isDownloading: true });
    expect(onLate).not.toHaveBeenCalled();
    s.set({ isUpdatePending: true, isDownloading: false, isStartupProcedureRunning: false });
    expect(onLate).toHaveBeenCalledWith({ phase: 'ready', afterMs: 4200 });
    expect(late).toHaveBeenCalledWith('pending');
    expect(s.listenerCount()).toBe(0);
  });

  it('check_timeout, später ohne Update: onLate meldet none, kein Hinweis', async () => {
    const s = store();
    const onLate = jest.fn(); const late = jest.fn();
    await runStartCheckDetailed(deps(s, { onLate }), late);
    s.set({ isStartupProcedureRunning: false });
    expect(onLate).toHaveBeenCalledWith(expect.objectContaining({ phase: 'none' }));
    expect(late).not.toHaveBeenCalled();
  });

  it('onLate ohne late-Rückruf: beobachtet trotzdem (nur Diagnose)', async () => {
    const s = store();
    const onLate = jest.fn();
    await runStartCheckDetailed(deps(s, { onLate }));
    s.set({ isUpdatePending: true, isStartupProcedureRunning: false });
    expect(onLate).toHaveBeenCalledWith(expect.objectContaining({ phase: 'ready' }));
  });

  it('no_update: Start-Phase vorbei ohne OTA', async () => {
    expect(await runStartCheckDetailed(deps(store({ isStartupProcedureRunning: false }))))
      .toMatchObject({ outcome: 'continue', reason: 'no_update' });
  });

  it('fetch_timeout: Laden dauert zu lange', async () => {
    expect(await runStartCheckDetailed(deps(store({ isUpdateAvailable: true, isDownloading: true }))))
      .toMatchObject({ outcome: 'continue', reason: 'fetch_timeout' });
  });

  it('fetch_failed: Laden begonnen, endet ohne geladene OTA', async () => {
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const run = runStartCheckDetailed(deps(s));
    await tick();
    s.set({ isDownloading: false, isStartupProcedureRunning: false });
    expect(await run).toMatchObject({ outcome: 'continue', reason: 'fetch_failed' });
  });

  it('reloaded: geladen und frei; elapsedMs gemessen', async () => {
    const c = clock();
    const s = store({ isUpdateAvailable: true, isDownloading: true });
    const run = runStartCheckDetailed(deps(s, { now: c.now }));
    await tick();
    c.advance(2500);
    s.set({ isUpdatePending: true, isDownloading: false });
    expect(await run).toEqual({ outcome: 'reload', reason: 'reloaded', elapsedMs: 2500 });
  });

  it('pending_hint: geladen, aber direkt vor dem Neustart geschützt', async () => {
    const isProtected = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ reason: 'pending_buffer', detail: '1×resting·0d' });
    expect(await runStartCheckDetailed(deps(store({ isUpdatePending: true }), { isProtected })))
      .toMatchObject({ outcome: 'pending', reason: 'pending_hint', protection: { reason: 'pending_buffer' } });
  });

  it('error: unerwarteter Fehler', async () => {
    expect(await runStartCheckDetailed(deps(store(), { getState: () => { throw new Error('x'); } })))
      .toMatchObject({ outcome: 'continue', reason: 'error' });
  });

  it('runStartCheck liefert dasselbe Ergebnis wie vorher (nur outcome)', async () => {
    expect(await runStartCheck(deps(store({ isUpdatePending: true })))).toBe('reload');
  });
});
