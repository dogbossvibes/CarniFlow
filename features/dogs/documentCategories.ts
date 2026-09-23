import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// UI-Kategorien. `kind` bleibt als Legacy-Feld kompatibel; neue Dokumente
// können zusätzlich die Health-Metadaten `category`/`subtype` verwenden.
export interface DocCategory { key: string; label: string; icon: IconName }

export const HEALTH_DOC_SUBTYPES = [
  { key: 'vaccination', label: 'Impfung' },
  { key: 'lab', label: 'Labor' },
  { key: 'vet_report', label: 'Tierarztbericht' },
  { key: 'imaging', label: 'Bildgebung / Röntgen' },
  { key: 'medication', label: 'Rezept / Medikament' },
  { key: 'other', label: 'Sonstiges' },
] as const;

export const DOC_CATEGORIES: DocCategory[] = [
  { key: 'gesundheit',   label: 'Gesundheit',        icon: 'medkit-outline' },
  { key: 'zucht',        label: 'Zucht / Stammbuch', icon: 'ribbon-outline' },
  { key: 'sport',        label: 'Sport / Prüfungen', icon: 'trophy-outline' },
  { key: 'versicherung', label: 'Versicherung',      icon: 'shield-checkmark-outline' },
  { key: 'tierarzt',     label: 'Tierarzt',          icon: 'medical-outline' },
  { key: 'sonstiges',    label: 'Sonstiges',         icon: 'document-text-outline' },
];

// Zusätzlich Alt-Schlüssel (frühere fixe Vorgaben) → schöne Anzeige für Bestandsdaten.
const META: Record<string, { label: string; icon: IconName }> = {
  ...Object.fromEntries(DOC_CATEGORIES.map(c => [c.key, { label: c.label, icon: c.icon }])),
  impfpass:  { label: 'Impfpass',  icon: 'medkit-outline' },
  stammbaum: { label: 'Stammbaum', icon: 'ribbon-outline' },
  hd_ed:     { label: 'HD/ED',     icon: 'medical-outline' },
  pruefung:  { label: 'Prüfung',   icon: 'trophy-outline' },
  health:    { label: 'Gesundheit', icon: 'medkit-outline' },
  breeding:  { label: 'Zucht / Stammbuch', icon: 'ribbon-outline' },
  insurance: { label: 'Versicherung', icon: 'shield-checkmark-outline' },
  other:     { label: 'Sonstiges', icon: 'document-text-outline' },
};

export function categoryLabel(key: string): string { return META[key]?.label ?? 'Sonstiges'; }
export function categoryIcon(key: string): IconName { return META[key]?.icon ?? 'document-text-outline'; }

export function isHealthDocument(document: { kind?: string | null; category?: string | null; subtype?: string | null }): boolean {
  if (document.category === 'health') return true;
  if (document.category && document.category !== 'health') return false;
  return ['impfpass', 'hd_ed', 'gesundheit', 'tierarzt'].includes(document.kind ?? '');
}

// Dateityp aus dem Objekt-Pfad/URL ableiten (Anzeige-Badge).
export type DocFileType = 'pdf' | 'image' | 'file';
export function fileTypeOf(path: string | null): DocFileType {
  const ext = (path ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'].includes(ext)) return 'image';
  return 'file';
}
export const FILE_TYPE_LABEL: Record<DocFileType, string> = { pdf: 'PDF', image: 'Bild', file: 'Datei' };
