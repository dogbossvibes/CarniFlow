// Prüfungsarten für das Prüfungsbuch (Spec docs/specs/phase2/01-pruefungsbuch.md).
//
// Der Katalog ist nur eine Eingabehilfe: gespeichert werden immer die tatsächlich
// eingegebenen Abteilungen samt Max-Punkten (siehe model.ts). Eine spätere
// Änderung hier verändert deshalb nie einen bestehenden Eintrag.
// Schlüssel sind dauerhaft (stehen in der DB) und dürfen nicht umbenannt werden.

export type ExamTypeKey =
  | 'igp' | 'ifh' | 'fh' | 'bh'
  | 'obedience' | 'rally' | 'agility' | 'mondioring'
  | 'other';

export interface ExamSectionTemplate {
  key: string;          // dauerhaft, z. B. 'A'
  label: string;
  maxPoints: number | null;   // null = keine Punkte (nur bestanden ja/nein)
}

export interface ExamLevel { key: string; label: string }

export interface ExamTypeDef {
  key: ExamTypeKey;
  label: string;
  /** Stufen in aufsteigender Reihenfolge (für «nächste Stufe»). */
  levels: readonly ExamLevel[];
  sections: readonly ExamSectionTemplate[];
  /** Für Turniere: Platzierung erfassen. */
  placement: boolean;
  /**
   * Abteilungen mit 100 Punkten nach der FCI-Bewertungsskala (V/SG/G/B/M/U);
   * «bestanden» wird vorgeschlagen, wenn jede Abteilung mindestens 70 Punkte hat.
   */
  fci100: boolean;
}

const L = (key: string, label = key): ExamLevel => ({ key, label });

export const EXAM_TYPES: readonly ExamTypeDef[] = [
  {
    key: 'igp', label: 'IGP',
    levels: [L('v', 'IGP-V'), L('1', 'IGP 1'), L('2', 'IGP 2'), L('3', 'IGP 3')],
    sections: [
      { key: 'A', label: 'Fährte', maxPoints: 100 },
      { key: 'B', label: 'Unterordnung', maxPoints: 100 },
      { key: 'C', label: 'Schutzdienst', maxPoints: 100 },
    ],
    placement: true, fci100: true,
  },
  {
    key: 'ifh', label: 'IFH',
    levels: [L('v', 'IFH-V'), L('1', 'IFH 1'), L('2', 'IFH 2'), L('3', 'IFH 3')],
    sections: [{ key: 'A', label: 'Fährte', maxPoints: 100 }],
    placement: true, fci100: true,
  },
  {
    key: 'fh', label: 'FH',
    levels: [L('1', 'FH 1'), L('2', 'FH 2')],
    sections: [{ key: 'A', label: 'Fährte', maxPoints: 100 }],
    placement: true, fci100: true,
  },
  {
    key: 'bh', label: 'BH/VT',
    levels: [L('bh', 'BH/VT')],
    sections: [
      { key: 'A', label: 'Unterordnung', maxPoints: null },
      { key: 'B', label: 'Verkehrsteil', maxPoints: null },
    ],
    placement: false, fci100: false,
  },
  {
    key: 'obedience', label: 'Obedience',
    levels: [L('beginner', 'Beginner'), L('1', 'Klasse 1'), L('2', 'Klasse 2'), L('3', 'Klasse 3')],
    sections: [{ key: 'T', label: 'Gesamt', maxPoints: null }],
    placement: true, fci100: false,
  },
  {
    key: 'rally', label: 'Rally Obedience',
    levels: [L('beginner', 'Beginner'), L('1', 'Klasse 1'), L('2', 'Klasse 2'), L('3', 'Klasse 3'), L('senior', 'Senior')],
    sections: [{ key: 'T', label: 'Gesamt', maxPoints: 100 }],
    placement: true, fci100: false,
  },
  {
    key: 'agility', label: 'Agility',
    levels: [L('a1', 'A1'), L('a2', 'A2'), L('a3', 'A3'), L('jumping', 'Jumping')],
    sections: [{ key: 'T', label: 'Fehlerpunkte', maxPoints: null }],
    placement: true, fci100: false,
  },
  {
    key: 'mondioring', label: 'Mondioring',
    levels: [L('brevet', 'Brevet'), L('1', 'Mondioring 1'), L('2', 'Mondioring 2'), L('3', 'Mondioring 3')],
    sections: [{ key: 'T', label: 'Gesamt', maxPoints: null }],
    placement: true, fci100: false,
  },
  {
    key: 'other', label: 'Andere',
    levels: [],
    sections: [{ key: 'T', label: 'Gesamt', maxPoints: null }],
    placement: true, fci100: false,
  },
];

export function examTypeByKey(key: string | null | undefined): ExamTypeDef | null {
  return EXAM_TYPES.find(t => t.key === key) ?? null;
}

/** Anzeigename einer Prüfung; unbekannte (künftige) Schlüssel bleiben lesbar. */
export function examDisplayName(typeKey: string, levelKey: string | null, freeLabel?: string | null): string {
  const def = examTypeByKey(typeKey);
  if (!def || def.key === 'other') {
    const base = (freeLabel ?? '').trim() || def?.label || typeKey;
    return levelKey ? `${base} ${levelKey}` : base;
  }
  const level = def.levels.find(l => l.key === levelKey);
  if (level) return level.label;
  return levelKey ? `${def.label} ${levelKey}` : def.label;
}

/** FCI-Bewertungsskala für eine Abteilung mit 100 Punkten. */
export type Fci100Rating = 'V' | 'SG' | 'G' | 'B' | 'M' | 'U';
export function fci100Rating(points: number): Fci100Rating {
  if (points >= 96) return 'V';
  if (points >= 90) return 'SG';
  if (points >= 80) return 'G';
  if (points >= 70) return 'B';
  if (points >= 36) return 'M';
  return 'U';
}
export const FCI100_PASS_POINTS = 70;
