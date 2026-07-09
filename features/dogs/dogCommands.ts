import AsyncStorage from '@react-native-async-storage/async-storage';

// Hunde-Kommandoliste pro Hund (Sport & Alltag). Aktuell LOKAL pro Gerät
// (AsyncStorage) — echte, funktionierende Speicherung, aber gerätelokal. Für
// geräteübergreifende Sync wäre die Tabelle dog_commands nötig (Migrationsvorschlag
// im Report). API schlank → ein späterer Umzug betrifft nur diese Datei.

export type CommandCategory = 'sport' | 'private';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DogCommand {
  id:             string;
  dogId:          string;
  name:           string;
  category:       CommandCategory;
  area:           string | null;   // z. B. Grundlagen, Unterordnung, Rückruf …
  verbalCue:      string;
  handSignal:     string | null;
  goal:           string | null;
  description:    string | null;
  steps:          string[];
  tips:           string[];
  commonMistakes: string[];
  videoUrl:       string | null;   // im Modell vorbereitet (Upload-UI = TODO)
  audioUrl:       string | null;
  difficulty:     Difficulty;
  isFavorite:     boolean;
  lastUsedAt:     string | null;
  usageCount:     number;
  createdAt:      string;
  updatedAt:      string;
}

export const COMMAND_AREAS = [
  'Grundlagen', 'Unterordnung', 'Fährte', 'Schutzdienst', 'Obedience',
  'Rückruf', 'Verhalten', 'Management', 'Apportieren', 'Fernsteuerung',
];

export const CATEGORY_LABEL: Record<CommandCategory, string> = { sport: 'Hundesport', private: 'Alltag / Privat' };

type NewCommand = Pick<DogCommand,
  'name' | 'category' | 'area' | 'verbalCue' | 'handSignal' | 'goal' | 'description' |
  'steps' | 'tips' | 'commonMistakes' | 'difficulty' | 'isFavorite'>;

const keyFor = (dogId: string) => `anyvo_commands_${dogId}`;

async function writeAll(dogId: string, list: DogCommand[]) {
  await AsyncStorage.setItem(keyFor(dogId), JSON.stringify(list));
}

export async function getCommands(dogId: string): Promise<DogCommand[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(dogId));
    const arr = raw ? (JSON.parse(raw) as DogCommand[]) : [];
    // Favoriten zuerst, dann zuletzt aktualisiert.
    return arr.sort((a, b) =>
      (a.isFavorite === b.isFavorite ? (a.updatedAt < b.updatedAt ? 1 : -1) : a.isFavorite ? -1 : 1));
  } catch { return []; }
}

export async function getCommand(dogId: string, id: string): Promise<DogCommand | null> {
  return (await getCommands(dogId)).find(c => c.id === id) ?? null;
}

export async function addCommand(dogId: string, input: NewCommand): Promise<DogCommand> {
  const now = new Date().toISOString();
  const cmd: DogCommand = {
    ...input, id: `${Date.now()}`, dogId,
    videoUrl: null, audioUrl: null, lastUsedAt: null, usageCount: 0, createdAt: now, updatedAt: now,
  };
  const list = await getCommands(dogId);
  await writeAll(dogId, [cmd, ...list]);
  return cmd;
}

export async function updateCommand(dogId: string, id: string, patch: Partial<NewCommand>): Promise<void> {
  const list = await getCommands(dogId);
  await writeAll(dogId, list.map(c => c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c));
}

export async function deleteCommand(dogId: string, id: string): Promise<void> {
  const list = await getCommands(dogId);
  await writeAll(dogId, list.filter(c => c.id !== id));
}

export async function toggleFavorite(dogId: string, id: string): Promise<void> {
  const list = await getCommands(dogId);
  await writeAll(dogId, list.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite, updatedAt: new Date().toISOString() } : c));
}

// Demo-Kommandos (Sport & Alltag) — user-getriggert über den Empty State.
export async function seedDemoCommands(dogId: string): Promise<void> {
  const now = new Date().toISOString();
  const mk = (p: NewCommand): DogCommand => ({
    ...p, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dogId,
    videoUrl: null, audioUrl: null, lastUsedAt: null, usageCount: 0, createdAt: now, updatedAt: now,
  });
  const demo: DogCommand[] = [
    mk({ name: 'Sitz', category: 'sport', area: 'Grundlagen', verbalCue: 'Sitz', handSignal: 'Flache Handfläche nach oben, dann nach vorne', goal: 'Der Hund setzt sich schnell, gerade und aufmerksam hin.', description: null, steps: ['In Grundposition bringen', 'Kommando „Sitz" geben', 'Handsignal zeigen', 'Sofort loben/belohnen'], tips: ['Kurze Einheiten, klares Timing, ruhige Stimme.'], commonMistakes: ['Sitzt schräg', 'Setzt sich zu langsam', 'Löst sich selbstständig auf'], difficulty: 'easy', isFavorite: true }),
    mk({ name: 'Sitz', category: 'private', area: 'Management', verbalCue: 'Sitz', handSignal: null, goal: 'Alltagssignal vor Strasse, Tür, Fütterung.', description: null, steps: [], tips: ['Weniger streng als im Sport — Hauptsache verlässlich.'], commonMistakes: [], difficulty: 'easy', isFavorite: false }),
    mk({ name: 'Platz', category: 'sport', area: 'Unterordnung', verbalCue: 'Platz', handSignal: 'Hand von oben nach unten', goal: 'Schnelles, gerades Ablegen in Grundstellung.', description: null, steps: [], tips: [], commonMistakes: ['Rollt auf die Seite'], difficulty: 'medium', isFavorite: false }),
    mk({ name: 'Hier', category: 'private', area: 'Rückruf', verbalCue: 'Hier', handSignal: null, goal: 'Zuverlässiger Rückruf im Alltag.', description: null, steps: [], tips: ['Immer positiv bestätigen, nie fürs Kommen schimpfen.'], commonMistakes: ['Kommt langsam', 'Bricht ab'], difficulty: 'medium', isFavorite: true }),
    mk({ name: 'Fuss', category: 'sport', area: 'Unterordnung', verbalCue: 'Fuss', handSignal: null, goal: 'Aufmerksames Bei-Fuss-Gehen ohne Vorpreschen.', description: null, steps: [], tips: [], commonMistakes: ['Vorpreschen', 'Abfallen nach hinten'], difficulty: 'hard', isFavorite: false }),
    mk({ name: 'Aus', category: 'private', area: 'Verhalten', verbalCue: 'Aus', handSignal: null, goal: 'Gegenstand/Beute sofort freigeben.', description: null, steps: [], tips: [], commonMistakes: [], difficulty: 'medium', isFavorite: false }),
    mk({ name: 'Voraus', category: 'sport', area: 'Fernsteuerung', verbalCue: 'Voraus', handSignal: 'Arm gestreckt nach vorne', goal: 'Zielgerichtetes Vorausschicken auf Distanz.', description: null, steps: [], tips: [], commonMistakes: ['Dreht zu früh um'], difficulty: 'hard', isFavorite: false }),
  ];
  const existing = await getCommands(dogId);
  await writeAll(dogId, [...demo, ...existing]);
}
