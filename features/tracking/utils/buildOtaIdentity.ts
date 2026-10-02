// Reine Anzeige-Aufbereitung für „BUILD & OTA" in der Fährten-Diagnose.
// Liest NUR, was expo-updates (`currentlyRunning`) und expo-application
// öffentlich dokumentieren — keine Manifest-Interna, kein Update-Check.
// Autoritative OTA-Identität: `updateId`. Der Git-Commit ist Zusatzdiagnostik.

export const EMPTY = '—';

export type RunningUpdateInfo = {
  updateId?: string | null;
  channel?: string | null;
  createdAt?: Date | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch?: boolean;
  emergencyLaunchReason?: string | null;
  runtimeVersion?: string | null;
};

export type BuildOtaInput = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
  running: RunningUpdateInfo;
  releaseGitCommit?: string | null;
};

export type BuildOtaIdentity = {
  status: 'ota' | 'embedded' | 'emergency';
  statusLabel: string;
  app: string;
  runtime: string;
  channel: string;
  source: string;
  otaUpdate: string;
  /** Vollständige UUID (für „Kopieren"); null wenn es keine OTA-ID gibt. */
  otaUpdateFull: string | null;
  gitCommit: string;
  published: string;
  emergency: string;
};

const present = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/** `1.0.3 (48)`; fehlt der Build, nur die Version; fehlt alles, „—". */
export function formatAppVersion(version?: string | null, build?: string | null): string {
  if (present(version) && present(build)) return `${version} (${build})`;
  if (present(version)) return version;
  if (present(build)) return `(${build})`;
  return EMPTY;
}

/** `01a0fdbb…aec1` — kurz, aber an Anfang und Ende wiedererkennbar. */
export function shortenId(id: string): string {
  return id.length <= 13 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Git-Commit auf 8 Zeichen gekürzt; nur gültige Hex-SHAs, sonst „—". */
export function formatGitCommit(commit?: string | null): string {
  const c = commit?.trim().toLowerCase();
  return c && /^[0-9a-f]{7,40}$/.test(c) ? `${c.slice(0, 8)}…` : EMPTY;
}

export function formatPublished(createdAt?: Date | null): string {
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return EMPTY;
  return createdAt.toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function buildOtaIdentity(input: BuildOtaInput): BuildOtaIdentity {
  const r = input.running;
  const emergency = r.isEmergencyLaunch === true;
  const status: BuildOtaIdentity['status'] = emergency ? 'emergency' : r.isEmbeddedLaunch ? 'embedded' : 'ota';
  const updateId = present(r.updateId) ? r.updateId : null;
  // Eingebettet: die Update-ID gehört dem Build-Bundle, nicht einer OTA.
  const otaId = status === 'embedded' ? null : updateId;

  return {
    status,
    statusLabel: status === 'emergency' ? 'Emergency Fallback' : status === 'embedded' ? 'Embedded' : 'OTA aktiv',
    app: formatAppVersion(input.nativeApplicationVersion, input.nativeBuildVersion),
    runtime: present(r.runtimeVersion) ? r.runtimeVersion : EMPTY,
    channel: present(r.channel) ? r.channel : EMPTY,
    source: r.isEmbeddedLaunch ? 'Im Build eingebettet' : 'OTA Update',
    otaUpdate: otaId ? shortenId(otaId) : 'Embedded / keine OTA-ID',
    otaUpdateFull: otaId,
    gitCommit: formatGitCommit(input.releaseGitCommit),
    published: formatPublished(r.createdAt),
    emergency: emergency
      ? (present(r.emergencyLaunchReason) ? `Ja · ${r.emergencyLaunchReason}` : 'Ja')
      : 'Nein',
  };
}
