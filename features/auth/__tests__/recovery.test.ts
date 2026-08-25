import {
  resolveRecoveryAction,
  recoveryDiagnosticContext,
  classifyRecoveryError,
} from '@/features/auth/recovery';

describe('resolveRecoveryAction', () => {
  it('gültiger PKCE-Code → exchange', () => {
    expect(resolveRecoveryAction({ code: 'abc123' })).toEqual({ kind: 'exchange', code: 'abc123' });
  });

  it('token_hash (type=recovery) → verifyOtp', () => {
    expect(resolveRecoveryAction({ token_hash: 'hash123', type: 'recovery' }))
      .toEqual({ kind: 'verifyOtp', tokenHash: 'hash123' });
  });

  it('token_hash ohne type → default recovery → verifyOtp', () => {
    expect(resolveRecoveryAction({ token_hash: 'hash123' }))
      .toEqual({ kind: 'verifyOtp', tokenHash: 'hash123' });
  });

  it('token_hash mit fremdem type (z. B. signup) → kein verifyOtp', () => {
    expect(resolveRecoveryAction({ token_hash: 'hash123', type: 'signup' })).toEqual({ kind: 'session' });
  });

  it('error-Parameter → error (abgelaufener/verbrauchter Link)', () => {
    expect(resolveRecoveryAction({ error: 'access_denied' })).toEqual({ kind: 'error' });
    expect(resolveRecoveryAction({ error_description: 'Email link is invalid or has expired' }))
      .toEqual({ kind: 'error' });
  });

  it('error hat Vorrang vor code/token_hash', () => {
    expect(resolveRecoveryAction({ error: 'otp_expired', code: 'abc', token_hash: 'h' }))
      .toEqual({ kind: 'error' });
  });

  it('kein Code/Token/Error → session', () => {
    expect(resolveRecoveryAction({})).toEqual({ kind: 'session' });
    expect(resolveRecoveryAction({ code: '' })).toEqual({ kind: 'session' });
  });
});

describe('recoveryDiagnosticContext — keine Secrets', () => {
  it('liefert nur Booleans/Typ, niemals Code/Token-Werte', () => {
    const ctx = recoveryDiagnosticContext({ code: 'SECRET_CODE', token_hash: 'SECRET_HASH', type: 'recovery' });
    expect(ctx).toEqual({ codePresent: true, tokenHashPresent: true, type: 'recovery', errorParamPresent: false });
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('SECRET_CODE');
    expect(serialized).not.toContain('SECRET_HASH');
  });

  it('markiert error-Parameter', () => {
    expect(recoveryDiagnosticContext({ error_description: 'expired' }).errorParamPresent).toBe(true);
    expect(recoveryDiagnosticContext({}).errorParamPresent).toBe(false);
  });
});

describe('classifyRecoveryError', () => {
  it('Verifier-/Flow-State-Fehler → same_device', () => {
    expect(classifyRecoveryError('invalid flow state, no valid flow state found')).toBe('same_device');
    expect(classifyRecoveryError('code_verifier should be non-empty')).toBe('same_device');
  });

  it('verbraucht/abgelaufen → expired', () => {
    expect(classifyRecoveryError('Email link is invalid or has expired')).toBe('expired');
    expect(classifyRecoveryError('One-time token not found')).toBe('expired');
  });

  it('Netzwerk → network', () => {
    expect(classifyRecoveryError('Network request failed')).toBe('network');
  });

  it('unbekannt → generic', () => {
    expect(classifyRecoveryError('something else')).toBe('generic');
    expect(classifyRecoveryError(null)).toBe('generic');
  });
});
