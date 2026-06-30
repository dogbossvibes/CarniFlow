import type { DogHubVM } from '@/components/dogs/types';

// ⚠️ NUR für DEV-Preview/Demo. Wird von KEINEM echten Screen importiert und
// enthält KEINE echten Nutzerdaten. Reine Schaufenster-Daten für die Optik.

const MALU: DogHubVM = {
  isDemo: true,
  identity: {
    id: 'demo-malu', name: 'Malu', photoUrl: null,
    breed: 'Holländischer Schäferhund', ageLabel: '4 J.', gender: 'female',
    discipline: 'IGP', statusLabel: 'IGP · Prüfungsvorbereitung',
    weightKg: 28, shoulderHeightCm: 58, titles: ['IGP 1', 'BH/VT'],
  },
  stats: [
    { key: 'tw',  value: '5',    label: 'Trainings/Wo' },
    { key: 'fq',  value: '87 %', label: 'Fährtenqualität', accent: true },
    { key: 'bel', value: 'Mittel', label: 'Belastung' },
    { key: 'goal', value: '62 %', label: 'Ziel IGP 1' },
  ],
  lastTrainingLabel: 'Fährte · gestern',
  todayRecommendation: 'Winkelarbeit – saubere 90°-Winkel mit ruhigem Tempo.',
  recentTrainings: [
    { id: 'd1', source: 'track',   discipline: 'Fährte',       dateLabel: 'gestern',    points: 87 },
    { id: 'd2', source: 'session', discipline: 'Unterordnung', dateLabel: 'vor 2 Tagen', points: 78 },
    { id: 'd3', source: 'session', discipline: 'Schutzdienst', dateLabel: 'vor 4 Tagen', points: 81 },
  ],
  faehrte: {
    thisWeek: 3, avgLengthLabel: '480 m', articles: 4, angles: 6, qualityPct: 87,
    trend: [0.6, 0.7, 0.65, 0.8, 0.78, 0.87],
  },
  goal: {
    title: 'IGP 1', overallPct: 62,
    parts: [ { label: 'Unterordnung', pct: 70 }, { label: 'Fährte', pct: 75 }, { label: 'Schutzdienst', pct: 41 } ],
  },
  health: {
    weightKg: 28, loadLabel: 'Mittel', restDays: 2, intenseSessions: 3,
    note: 'Pfoten nach Asphalt-Fährte kontrollieren.', nextVetLabel: 'Impfung fällig in 3 Wochen',
  },
  documents: [
    { key: 'impf', label: 'Impfpass', present: true },
    { key: 'stamm', label: 'Stammbaum', present: true },
    { key: 'hdred', label: 'HD/ED-Auswertung', present: false },
    { key: 'pruef', label: 'Prüfungsergebnisse', present: true },
  ],
  trainer: { name: 'Sandra K.', plan: 'Aufbau Fährte – Phase 2', lastComment: 'Winkel sitzen, jetzt Tempo halten. 👍' },
  aiTip: {
    title: 'Heute ideal für Fährte',
    hint: 'Letzte Einheit war intensiv (Schutzdienst). Boden ist feucht – gute Bedingungen.',
    recommendation: 'Winkelarbeit, 400–500 m, 3 Gegenstände.',
    schedule: { today: 'Fährte (locker)', tomorrow: 'Unterordnung', rest: 'Sonntag Ruhetag' },
  },
};

const NERO: DogHubVM = {
  isDemo: true,
  identity: {
    id: 'demo-nero', name: 'Nero', photoUrl: null,
    breed: 'Malinois', ageLabel: '3 J.', gender: 'male',
    discipline: 'Mondioring', statusLabel: 'Mondioring · Aufbau',
    weightKg: 30, shoulderHeightCm: 62, titles: ['MR1'],
  },
  stats: [
    { key: 'tw',  value: '4', label: 'Trainings/Wo' },
    { key: 'fq',  value: '—', label: 'Fährtenqualität' },
    { key: 'bel', value: 'Hoch', label: 'Belastung', accent: true },
    { key: 'goal', value: '—', label: 'Ziel' },
  ],
  lastTrainingLabel: 'Unterordnung · vor 2 Tagen',
  todayRecommendation: 'Lockerer Spiel- und Motivationstag empfohlen.',
  recentTrainings: [
    { id: 'n1', source: 'session', discipline: 'Unterordnung', dateLabel: 'vor 2 Tagen', points: 84 },
    { id: 'n2', source: 'session', discipline: 'Schutzdienst', dateLabel: 'vor 3 Tagen', points: 88 },
  ],
  faehrte: { thisWeek: 0, avgLengthLabel: null, articles: null, angles: null, qualityPct: null, trend: [] },
  goal: { title: null, overallPct: null, parts: [] },
  health: { weightKg: 30, loadLabel: 'Hoch', restDays: 1, intenseSessions: 4, note: null, nextVetLabel: null },
  documents: [
    { key: 'impf', label: 'Impfpass', present: true },
    { key: 'stamm', label: 'Stammbaum', present: true },
    { key: 'hdred', label: 'HD/ED-Auswertung', present: false },
    { key: 'pruef', label: 'Prüfungsergebnisse', present: false },
  ],
  trainer: { name: 'Marco B.', plan: 'Mondioring Grundlagen', lastComment: 'Mehr Impulskontrolle in der Bewachung.' },
  aiTip: {
    title: 'Heute lieber Ruhe',
    hint: 'Belastung der Woche ist hoch.',
    recommendation: 'Spiel & Motivation, kurze Einheit.',
    schedule: { today: 'Spiel', tomorrow: 'Unterordnung', rest: 'heute leichter Tag' },
  },
};

const INARI: DogHubVM = {
  isDemo: true,
  identity: {
    id: 'demo-inari', name: 'Inari', photoUrl: null,
    breed: 'Holländischer Schäferhund', ageLabel: '7 Mon.', gender: 'female',
    discipline: 'Aufbau', statusLabel: 'Aufbau · Grundlagen',
    weightKg: 19, shoulderHeightCm: 52, titles: [],
  },
  stats: [
    { key: 'tw',  value: '3', label: 'Trainings/Wo' },
    { key: 'fq',  value: '—', label: 'Fährtenqualität' },
    { key: 'bel', value: 'Leicht', label: 'Belastung' },
    { key: 'goal', value: '—', label: 'Ziel' },
  ],
  lastTrainingLabel: 'Spiel & Motivation · heute',
  todayRecommendation: 'Grundlagen & Bindung – kurze, positive Einheiten.',
  recentTrainings: [
    { id: 'i1', source: 'session', discipline: 'Spiel & Motivation', dateLabel: 'heute', points: null },
  ],
  faehrte: { thisWeek: 0, avgLengthLabel: null, articles: null, angles: null, qualityPct: null, trend: [] },
  goal: { title: null, overallPct: null, parts: [] },
  health: { weightKg: 19, loadLabel: 'Leicht', restDays: 3, intenseSessions: 0, note: 'Junghund – Belastung dosieren.', nextVetLabel: null },
  documents: [
    { key: 'impf', label: 'Impfpass', present: true },
    { key: 'stamm', label: 'Stammbaum', present: true },
    { key: 'hdred', label: 'HD/ED-Auswertung', present: false },
    { key: 'pruef', label: 'Prüfungsergebnisse', present: false },
  ],
  trainer: null,
  aiTip: {
    title: 'Fokus: Grundlagen',
    hint: 'Junghund im Aufbau – Bindung und Markertraining stärken.',
    recommendation: 'Kurze Spiel-Einheiten, viel Lob.',
  },
};

export const DEMO_DOGS: DogHubVM[] = [MALU, NERO, INARI];
