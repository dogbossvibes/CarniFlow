import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Dokument-Kategorien (im `dog_documents.kind`-Textfeld gespeichert — keine Migration).
export interface DocCategory { key: string; label: string; icon: IconName }

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
};

export function categoryLabel(key: string): string { return META[key]?.label ?? 'Sonstiges'; }
export function categoryIcon(key: string): IconName { return META[key]?.icon ?? 'document-text-outline'; }

// Dateityp aus dem Objekt-Pfad/URL ableiten (Anzeige-Badge).
export type DocFileType = 'pdf' | 'image' | 'file';
export function fileTypeOf(path: string | null): DocFileType {
  const ext = (path ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'].includes(ext)) return 'image';
  return 'file';
}
export const FILE_TYPE_LABEL: Record<DocFileType, string> = { pdf: 'PDF', image: 'Bild', file: 'Datei' };
