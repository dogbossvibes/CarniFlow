// Alle wählbaren Sparten (Profil → „Meine Sparten"). Die im Profil aktivierten
// werden in `profiles.aktive_sparten` gespeichert.
export interface Sparte { id: string; label: string; icon: string }

export const ALLE_SPARTEN: Sparte[] = [
  { id: 'IGP',          label: 'IGP',          icon: '🛡️' },
  { id: 'Unterordnung', label: 'Unterordnung', icon: '🎯' },
  { id: 'Schutzdienst', label: 'Schutzdienst', icon: '⚔️' },
  { id: 'Fährte',       label: 'Fährte',       icon: '👃' },
  { id: 'Obedience',    label: 'Obedience',    icon: '🎪' },
  { id: 'Agility',      label: 'Agility',      icon: '🏃' },
  { id: 'Begleithund',  label: 'Begleithund',  icon: '🐕' },
  { id: 'Mondioring',   label: 'Mondioring',   icon: '🔵' },
  { id: 'IBGH',         label: 'IBGH',         icon: '📋' },
  { id: 'Rally',        label: 'Rally',        icon: '🚩' },
  { id: 'Mantrailing',  label: 'Mantrailing',  icon: '🔍' },
  { id: 'Rettungshund', label: 'Rettungshund', icon: '🚨' },
];

// Standard, wenn der Nutzer noch nichts gewählt hat. Obedience ist bewusst NICHT
// dabei — es ist opt-in und muss im Profil unter „Meine Sparten" aktiviert werden.
export const DEFAULT_SPARTEN = [
  'IGP', 'Unterordnung', 'Schutzdienst', 'Fährte', 'Agility', 'Begleithund',
];
