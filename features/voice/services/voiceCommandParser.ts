import type { MarkerType, AngleKind } from '@/features/tracking/store/trackingStore';

// Sprachbefehle für den Fährtenmodus. Erkennt kurze Kommandos inkl.
// Schweizerdeutsch-/Synonym-Varianten.
export type VoiceCommand =
  | { type: 'ADD_MARKER'; markerType: MarkerType; label: string; angleKind?: AngleKind }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP_RECORDING' }
  | { type: 'CENTER_MAP' }
  | { type: 'AUDIO_ON' }
  | { type: 'AUDIO_OFF' };

// Reihenfolge: spezifischere/zusammengesetzte Befehle zuerst.
const RULES: { match: RegExp; cmd: () => VoiceCommand }[] = [
  { match: /\b(audio|ton|ansage[n]?)\s*(an|ein|aktiv)/, cmd: () => ({ type: 'AUDIO_ON' }) },
  { match: /\b(audio|ton|ansage[n]?)\s*(aus|us|stumm|off)/, cmd: () => ({ type: 'AUDIO_OFF' }) },
  { match: /\b(standort|position|karte|mich)\b.*(zentrier|zentr|mitt)/, cmd: () => ({ type: 'CENTER_MAP' }) },
  { match: /\b(zentrier|zentriere|zentrum)\b/, cmd: () => ({ type: 'CENTER_MAP' }) },
  { match: /\b(training|fährte|suche)?\s*(beend|fertig|stopp[e]?n|schluss|abschliess)/, cmd: () => ({ type: 'STOP_RECORDING' }) },
  { match: /\b(weiter|fortsetz|wiiter|fortfahren|resume)\b/, cmd: () => ({ type: 'RESUME' }) },
  { match: /\b(pause|pausier|anhalten|halt|stop)\b/, cmd: () => ({ type: 'PAUSE' }) },
  { match: /\b(gegenstand|gegenständ|artikel|objekt|apport)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'gegenstand', label: 'Gegenstand' }) },
  { match: /\b(absatz)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'winkel', label: 'Absatz', angleKind: 'absatz' }) },
  { match: /\b(spitzwinkel|spitzer winkel|spitz)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'winkel', label: 'Spitzwinkel', angleKind: 'spitz' }) },
  { match: /\b(linkswinkel|links\s?winkel|winkel links)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'winkel', label: 'Linkswinkel', angleKind: 'links' }) },
  { match: /\b(rechtswinkel|rechts\s?winkel|winkel rechts)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'winkel', label: 'Rechtswinkel', angleKind: 'rechts' }) },
  { match: /\b(winkel|ecke|wink|kurve)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'winkel', label: 'Winkel' }) },
  { match: /\b(verleitung|ablenkung|fremdfährte|fremd|verleit)\b/, cmd: () => ({ type: 'ADD_MARKER', markerType: 'verleitung', label: 'Verleitung' }) },
];

export function parseVoiceCommand(text: string): VoiceCommand | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const r of RULES) if (r.match.test(t)) return r.cmd();
  return null;
}

export function commandLabel(cmd: VoiceCommand): string {
  switch (cmd.type) {
    case 'ADD_MARKER':     return `${cmd.label} gesetzt`;
    case 'PAUSE':          return 'Pausiert';
    case 'RESUME':         return 'Fortgesetzt';
    case 'STOP_RECORDING': return 'Beenden';
    case 'CENTER_MAP':     return 'Karte zentriert';
    case 'AUDIO_ON':       return 'Audio an';
    case 'AUDIO_OFF':      return 'Audio aus';
  }
}
