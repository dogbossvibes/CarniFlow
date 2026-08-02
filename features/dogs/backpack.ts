import AsyncStorage from '@react-native-async-storage/async-storage';

// Hunde-„Rucksack" (Ausrüstungs-/Packliste) — pro NUTZER und pro HUND, LOKAL auf
// dem Gerät (AsyncStorage). Kein Supabase, keine Migration: der Rucksack ist eine
// persönliche Checkliste, die geräteweise geführt wird. Ein späterer Server-Umzug
// beträfe nur diese Datei (schlanke API).
//
// Trennung: Storage-Key `dog_backpack:<userId>:<dogId>` → Nutzer A ≠ Nutzer B und
// Hund A ≠ Hund B teilen sich NIE eine Liste.
//
// Zwei orthogonale Zustände pro Eintrag:
//   isActive  = gehört (dauerhaft) zur Ausrüstung dieses Hundes
//   isPacked  = für das nächste Training eingepackt (Häkchen; wird zurückgesetzt)
// „Reset" setzt AUSSCHLIESSLICH isPacked zurück — die Stammliste bleibt erhalten.

export type EquipmentCategory =
  | 'faehrte'
  | 'unterordnung'
  | 'schutzdienst'
  | 'obedience'
  | 'allgemein'
  | 'gesundheit'
  | 'sonstiges';

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'faehrte', 'unterordnung', 'schutzdienst', 'obedience', 'allgemein', 'gesundheit', 'sonstiges',
];

const CATEGORY_SET = new Set<string>(EQUIPMENT_CATEGORIES);

export interface DogBackpackItem {
  id:        string;
  label:     string;
  category?:  EquipmentCategory;   // optional — freie Einträge erlaubt
  isActive:  boolean;              // gehört zur Ausrüstung (Stammliste)
  isPacked:  boolean;              // fürs nächste Training eingepackt (Häkchen)
  sortOrder: number;              // Anzeige-/Sortierreihenfolge (0..n-1)
  createdAt: string;              // ISO
}

// Nur diese Felder darf der Aufrufer beim Anlegen/Bearbeiten setzen.
export type NewBackpackItem = { label: string; category?: EquipmentCategory };

// Reine Statuslogik für kompakte Backpack-Darstellungen.
export type BackpackStatus = 'empty' | 'none_packed' | 'all_ready' | 'partial';
export function backpackStatus(active: number, packed: number): BackpackStatus {
  if (active <= 0) return 'empty';
  if (packed >= active) return 'all_ready';
  if (packed <= 0) return 'none_packed';
  return 'partial';
}

const PREFIX = 'dog_backpack';
const keyFor = (userId: string, dogId: string) => `${PREFIX}:${userId}:${dogId}`;

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Sanitizer ──────────────────────────────────────────────────────────────
// Toleriert korrupte/teilweise Daten: Nicht-Arrays, kaputte Objekte, fehlende
// Felder. Verworfen werden nur Einträge ohne brauchbares Label. Alles andere wird
// defensiv auf gültige Werte gezwungen; sortOrder wird lückenlos neu vergeben.
export function sanitize(raw: unknown): DogBackpackItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cleaned: DogBackpackItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const label = typeof e.label === 'string' ? e.label.trim() : '';
    if (!label) continue;                         // ohne Label ist der Eintrag wertlos

    let id = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : newId();
    if (seen.has(id)) id = newId();               // Duplikat-IDs auflösen
    seen.add(id);

    const category =
      typeof e.category === 'string' && CATEGORY_SET.has(e.category)
        ? (e.category as EquipmentCategory)
        : undefined;

    const createdAt =
      typeof e.createdAt === 'string' && e.createdAt ? e.createdAt : new Date(0).toISOString();

    cleaned.push({
      id,
      label,
      category,
      // isActive default true (Bestandsschutz: ältere/unklare Einträge bleiben sichtbar)
      isActive: typeof e.isActive === 'boolean' ? e.isActive : true,
      isPacked: e.isPacked === true,              // Häkchen defaultet auf false
      sortOrder: typeof e.sortOrder === 'number' && Number.isFinite(e.sortOrder) ? e.sortOrder : cleaned.length,
      createdAt,
    });
  }

  // Stabile Reihenfolge nach sortOrder, dann lückenlos 0..n-1 neu vergeben.
  cleaned.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.createdAt < b.createdAt ? -1 : 1));
  return cleaned.map((it, i) => ({ ...it, sortOrder: i }));
}

// ── Persistenz ─────────────────────────────────────────────────────────────
async function writeAll(userId: string, dogId: string, list: DogBackpackItem[]): Promise<DogBackpackItem[]> {
  const normalized = list.map((it, i) => ({ ...it, sortOrder: i }));
  await AsyncStorage.setItem(keyFor(userId, dogId), JSON.stringify(normalized));
  return normalized;
}

export async function getBackpack(userId: string, dogId: string): Promise<DogBackpackItem[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, dogId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];   // korrupte JSON → leerer, funktionierender Rucksack (kein Crash)
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export async function addItem(userId: string, dogId: string, input: NewBackpackItem): Promise<DogBackpackItem> {
  const label = (input.label ?? '').trim();
  if (!label) throw new Error('Label darf nicht leer sein');
  const list = await getBackpack(userId, dogId);
  const item: DogBackpackItem = {
    id: newId(),
    label,
    category: input.category && CATEGORY_SET.has(input.category) ? input.category : undefined,
    isActive: true,
    isPacked: false,
    sortOrder: list.length,             // ans Ende
    createdAt: new Date().toISOString(),
  };
  await writeAll(userId, dogId, [...list, item]);
  return item;
}

export async function updateItem(
  userId: string, dogId: string, id: string, patch: Partial<NewBackpackItem>,
): Promise<void> {
  const list = await getBackpack(userId, dogId);
  await writeAll(userId, dogId, list.map(it => {
    if (it.id !== id) return it;
    const next = { ...it };
    if (patch.label !== undefined) {
      const label = patch.label.trim();
      if (label) next.label = label;   // leeres Label wird ignoriert (Eintrag bleibt gültig)
    }
    if (patch.category !== undefined) {
      next.category = patch.category && CATEGORY_SET.has(patch.category) ? patch.category : undefined;
    }
    return next;
  }));
}

export async function deleteItem(userId: string, dogId: string, id: string): Promise<void> {
  const list = await getBackpack(userId, dogId);
  await writeAll(userId, dogId, list.filter(it => it.id !== id));
}

// ── Zustände: aktiv/inaktiv & eingepackt/nicht eingepackt ────────────────────
export async function setActive(userId: string, dogId: string, id: string, isActive: boolean): Promise<void> {
  const list = await getBackpack(userId, dogId);
  await writeAll(userId, dogId, list.map(it => it.id === id ? { ...it, isActive } : it));
}

export async function setPacked(userId: string, dogId: string, id: string, isPacked: boolean): Promise<void> {
  const list = await getBackpack(userId, dogId);
  await writeAll(userId, dogId, list.map(it => it.id === id ? { ...it, isPacked } : it));
}

export async function togglePacked(userId: string, dogId: string, id: string): Promise<void> {
  const list = await getBackpack(userId, dogId);
  await writeAll(userId, dogId, list.map(it => it.id === id ? { ...it, isPacked: !it.isPacked } : it));
}

// ── Reihenfolge per ↑/↓ ───────────────────────────────────────────────────────
export async function moveItem(
  userId: string, dogId: string, id: string, direction: 'up' | 'down',
): Promise<DogBackpackItem[]> {
  const list = await getBackpack(userId, dogId);
  const idx = list.findIndex(it => it.id === id);
  if (idx === -1) return list;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;   // schon ganz oben/unten
  const next = [...list];
  [next[idx], next[target]] = [next[target], next[idx]];
  return writeAll(userId, dogId, next);
}

// ── Reset: NUR den Check-Status (isPacked) zurücksetzen ───────────────────────
// Die Stammliste (Einträge, aktiv/inaktiv, Reihenfolge) bleibt unangetastet.
export async function resetPacked(userId: string, dogId: string): Promise<void> {
  const list = await getBackpack(userId, dogId);
  if (!list.some(it => it.isPacked)) return;    // nichts zu tun
  await writeAll(userId, dogId, list.map(it => it.isPacked ? { ...it, isPacked: false } : it));
}

// ── Standardvorschläge ────────────────────────────────────────────────────────
// Reine Datentabelle. Werden NIE automatisch gespeichert — der Aufrufer (UI) legt
// ausgewählte Vorschläge bewusst über addItem() an.
export type BackpackSuggestion = { label: string; category: EquipmentCategory };

export const DEFAULT_SUGGESTIONS: Record<string, BackpackSuggestion[]> = {
  faehrte: [
    { label: 'Fährtenleine', category: 'faehrte' },
    { label: 'Geschirr',     category: 'faehrte' },
    { label: 'Halsband',     category: 'faehrte' },
    { label: 'Holz',         category: 'faehrte' },
    { label: 'Leder',        category: 'faehrte' },
    { label: 'Dübel',        category: 'faehrte' },
    { label: 'Futter',       category: 'faehrte' },
    { label: 'Wasser',       category: 'faehrte' },
  ],
  unterordnung: [
    { label: 'Leine',       category: 'unterordnung' },
    { label: 'Halsband',    category: 'unterordnung' },
    { label: 'Apportel',    category: 'unterordnung' },
    { label: 'Spielzeug',   category: 'unterordnung' },
    { label: 'Belohnung',   category: 'unterordnung' },
    { label: 'Wasser',      category: 'unterordnung' },
  ],
  schutzdienst: [
    { label: 'Geschirr',    category: 'schutzdienst' },
    { label: 'Leine',       category: 'schutzdienst' },
    { label: 'Beisskissen', category: 'schutzdienst' },
    { label: 'Spielzeug',   category: 'schutzdienst' },
    { label: 'Wasser',      category: 'schutzdienst' },
  ],
  allgemein: [
    { label: 'Kotbeutel',        category: 'allgemein' },
    { label: 'Wasser',           category: 'allgemein' },
    { label: 'Napf',             category: 'allgemein' },
    { label: 'Erste-Hilfe-Set',  category: 'allgemein' },
  ],
};

// Reine Lesefunktion: liefert die Vorschläge einer Disziplin/Kategorie (oder []).
// Persistiert NICHTS.
export function getSuggestions(discipline: string): BackpackSuggestion[] {
  return DEFAULT_SUGGESTIONS[discipline] ?? [];
}

// Vergleichsnorm für Duplikate: getrimmt + case-insensitive.
export const normalizeLabel = (s: string) => s.trim().toLowerCase();

// Duplikatschutz: filtert Vorschläge heraus, deren Label bereits (getrimmt,
// case-insensitive) im Rucksack steckt — auch Doppelungen innerhalb der Auswahl.
// Reine Funktion, persistiert NICHTS.
export function filterNewSuggestions(
  existing: { label: string }[], suggestions: BackpackSuggestion[],
): BackpackSuggestion[] {
  const seen = new Set(existing.map(e => normalizeLabel(e.label)));
  const out: BackpackSuggestion[] = [];
  for (const sug of suggestions) {
    const norm = normalizeLabel(sug.label);
    if (seen.has(norm)) continue;
    seen.add(norm);          // verhindert Doppelungen innerhalb derselben Auswahl
    out.push(sug);
  }
  return out;
}

// i18n-Key je Kategorie (Labels liegen im Übersetzungs-Dictionary, nicht hier).
export const CATEGORY_I18N_KEY: Record<EquipmentCategory, string> = {
  faehrte:      'backpack.cat.faehrte',
  unterordnung: 'backpack.cat.unterordnung',
  schutzdienst: 'backpack.cat.schutzdienst',
  obedience:    'backpack.cat.obedience',
  allgemein:    'backpack.cat.allgemein',
  gesundheit:   'backpack.cat.gesundheit',
  sonstiges:    'backpack.cat.sonstiges',
};

// Disziplin-Gruppen für den Vorschlags-Picker (Reihenfolge = Anzeigereihenfolge).
export const SUGGESTION_GROUPS: { discipline: keyof typeof DEFAULT_SUGGESTIONS; labelKey: string }[] = [
  { discipline: 'faehrte',      labelKey: 'backpack.cat.faehrte' },
  { discipline: 'unterordnung', labelKey: 'backpack.cat.unterordnung' },
  { discipline: 'schutzdienst', labelKey: 'backpack.cat.schutzdienst' },
  { discipline: 'allgemein',    labelKey: 'backpack.cat.allgemein' },
];
