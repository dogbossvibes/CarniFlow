import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'features'];
const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const TEXT_PATTERNS = [
  /<Text\b[^>]*>([^<{]*[A-Za-zÄÖÜäöüß][^<{]*)<\/Text>/g,
  /Alert\.alert\(([^)]*)\)/g,
  /\b(?:title|subtitle|label|placeholder|accessibilityLabel)=["']([^"']*[A-Za-zÄÖÜäöüß][^"']*)["']/g,
  /\b(?:showToast|Toast)\.[a-zA-Z]+\(([^)]*)\)/g,
];

const VISIBLE_ALLOWLIST = [
  'ANYVO',
  'Smart Coach',
  'Smart Feedback',
  'SMART COACH',
  'LIVE',
  'LIFETIME',
  'Founder Active',
  'Training',
  'Hub',
  'Active',
  'ACTIVE',
  'CONNECT',
  'GW',
  'OW',
  'BW',
  'N',
  'S',
  'W',
  'O',
  'PKT',
  'JSON Export',
  'Precision Debug',
  'Precision Debug ▸',
  'LIFETIME',
];

const SEPARATE_RELEASE_PATHS = [
  'features/connect/',
];

const LEGAL_OR_SYSTEM_SNIPPETS = [
  'Konto löschen',
  'Alle deine Daten',
  'Bist du sicher?',
  'dauerhaft gelöscht',
  'Datenschutz',
  'Nutzungsbedingungen',
  'App-Store',
  'RLS',
  'Sicherheitsregeln',
  'Systemeinstellungen',
  'Einstellungen →',
  'Expo Go',
  'Face ID',
  'Touch ID',
  'Fingerabdruck',
  'Geräte-Code',
  'neuer Build',
  'Dev-Build',
  'Store-Build',
  'ANYVO v',
];

const PRODUCT_OR_DOMAIN_SNIPPETS = [
  'TRAIN.',
  'ANALYZE.',
  'IMPROVE.',
  'Dog Hub – Preview',
  'Smart Search',
  'Insights',
  'Smart Coach',
  'Smart Feedback',
  'Trainer',
  'Active',
  'Training',
  'Fährte',
  'Kommandos',
  'Alltag / Privat',
  'MFi',
];

const STANDARD_SWISS_UI_SNIPPETS = [
  'HUNDE',
  'EINHEITEN',
  'SERIE',
  'TRAINING HUB',
  'Heute wichtig',
  'Fortschritte',
  'Empfehlungen',
  'Verlauf',
  'Eigene semantische Suche starten',
  'Vorschläge',
  'Suche nach Bedeutung, nicht nur nach Wörtern.',
  'Beispiele',
  'BERECHTIGUNGEN',
  'Berechtigungen nicht gefunden.',
  'Zurück',
  'Tippe ein Kommando an',
  'Mit allen Details: Signal, Handsignal, Ziel, Schritte',
  'Bereich (optional)',
  'Schritte (optional',
  'Name und verbales Signal sind nötig.',
  'z. B. Sitz',
  'Flache Hand nach oben',
  'Was soll das Kommando bewirken?',
  'optional',
  'GESAMTPUNKTZAHL',
  'Beobachtungen zur Ausarbeitung',
  'AKTIVE FÄHRTEN',
  'PUNKTE',
  'LETZTE FÄHRTE',
  'TS',
  'GS',
  'Materialien',
  'Teilstrecken',
  'ANSATZ',
  'Teilstrecke',
  'Distanz zum Ansatz',
  'GPS wird gesucht',
  'Abstand zum Hund',
  'Jetzt starten',
  'Laufende Absuche fortsetzen?',
  'Es wurde eine unterbrochene Absuche gefunden.',
  'Fortsetzen',
  'Einheit nicht gefunden.',
  'Bearbeiten',
  'Einheit löschen',
  'Einheit bearbeiten',
  'Speichern',
  'Schutzdienst Phase B',
  'Was lief gut?',
  'PLANUNG',
  'TERMIN-ANFRAGEN AN DICH',
  'TERMINUMFRAGEN',
  'OFFENE TRAINER-TERMINE',
  'Hinzugefügt',
  'Termin wurde in deinen Kalender übernommen.',
  'Umfrage nicht gefunden.',
  'TERMINUMFRAGE',
  'Wähle deine Verfügbarkeit',
  'Deine Antwort wurde gespeichert.',
  'Terminumfrage',
  'Erstelle eine neue Umfrage',
  'Notiz an Kunden',
  'Terminvorschläge',
  'Entfernen',
  'Termin hinzufügen',
  'Kunden einladen',
  'Noch keine verbundenen Kunden.',
  'Bitte alle Termine ausfüllen',
  'Umfrage wurde gesendet',
  'Dein Name',
  'Apportierholz mitbringen',
  'Datum wählen',
  'Von 09:00',
  'Bis 11:00',
  'Ort (optional)',
  'Meine Umfragen',
  'Ergebnisse & offene Abstimmungen',
  'Noch keine Umfragen erstellt.',
  'Umfrage erstellen',
  'Verbunden',
  'Ort suchen',
  'Lade wichtige Unterlagen deines Hundes hoch',
  'Kein Tierarzttermin hinterlegt.',
  'Trage die erste Läufigkeit ein',
  'Ø Zyklus',
  'Prognose ist nur eine Schätzung',
  'Läufigkeit im Blick',
  'Premium freischalten',
  'Auswertung & Verlauf',
  'Ansehen',
  'Schnellstart',
  'ungenau',
  'Einklappen',
  'Debug-Modus umschalten',
  'Keine Sprachmemo vorhanden.',
  'Spracherkennung',
  'Bitte erlaube Mikrofon & Spracherkennung',
  'Bitte erlaube den Mikrofonzugriff',
  'Die Aufnahme konnte nicht gestartet werden.',
  'Konto konnte nicht gelöscht werden.',
  'DEL_TITLE, DEL_MSG',
  'error.message',
  'Einheit konnte nicht gespeichert werden.',
  'e.title, undefined, options',
  "Ups 🐾', error",
];

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const p = path.join(full, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.relative(ROOT, p)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function snippetFor(match) {
  return String(match[1] ?? match[0]).replace(/\s+/g, ' ').trim();
}

function lineNo(source, index) {
  return source.slice(0, index).split('\n').length;
}

function classify(file, line, snippet) {
  const normalized = snippet.replace(/^['"`]|['"`]$/g, '').trim();
  const alreadyLocalized = /(^|[^A-Za-z0-9_])t\(['"`]/.test(line)
    || /translate\(['"`]/.test(line)
    || /(^|[^A-Za-z0-9_])t\(['"`]/.test(normalized)
    || /translate\(['"`]/.test(normalized);
  const technicalLine = /(queryKey|pathname|href|route|router\.|productId|packageId|plan:|status:|kind:|key=|style=|name=|import | from |require\(|colors=|stroke=|fill=|fontWeight|fontSize|borderColor|backgroundColor)/.test(line);
  const dataLine = /(notes|transcript|body|message|error\.message|res\.error|claim\.error|unit\.|profile\.|dog\.|clientName|meta\.name|priceString|priceLabel)/.test(line);
  const legalLine = /(terms|privacy|Datenschutz|Nutzungsbedingungen|AGB|legal|App-Store|Store)/i.test(line);
  const devLine = /(__DEV__|console\.|test\(|describe\(|it\(|TODO|DEBUG)/.test(line) || file.includes('/dev/');
  const enumLine = /(discipline|angle_kind|marker|storage|AsyncStorage|Supabase|RevenueCat|entitlement|provider|event|route|id:|type:)/.test(line) && !/<Text|Alert\.alert|placeholder|accessibilityLabel/.test(line);
  const falsePositive = !normalized || /^[0-9:.,/+\-×%() ]+$/.test(normalized) || normalized.includes('StyleSheet.absoluteFill');

  if (falsePositive || alreadyLocalized) return 'I';
  if (SEPARATE_RELEASE_PATHS.some(prefix => file.startsWith(prefix))) return 'I';
  if (devLine) return 'E';
  if (legalLine || LEGAL_OR_SYSTEM_SNIPPETS.some(s => normalized.includes(s) || line.includes(s))) return 'D';
  if (file === 'app/konto-loeschen.tsx') return 'D';
  if (enumLine) return 'G';
  if (dataLine && !/Alert\.alert|placeholder|accessibilityLabel/.test(line)) return 'H';
  if (technicalLine && !/<Text|Alert\.alert|placeholder|accessibilityLabel/.test(line)) return 'F';
  if (/https?:\/\//.test(normalized) || /^[A-Z0-9_]+(?:,\s*[A-Z0-9_]+)*$/.test(normalized)) return 'F';
  if (
    VISIBLE_ALLOWLIST.includes(normalized)
    || PRODUCT_OR_DOMAIN_SNIPPETS.some(s => normalized.includes(s))
    || STANDARD_SWISS_UI_SNIPPETS.some(s => normalized.includes(s))
  ) return 'C';
  if (/accessibilityLabel/.test(line)) return 'B';

  // Remaining hardcoded JSX/alerts with visible natural language are release-relevant.
  if (/<Text|Alert\.alert|placeholder/.test(line)) return 'A';
  return 'I';
}

function scan() {
  const files = SCAN_DIRS.flatMap(walk);
  const candidates = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of TEXT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const start = match.index;
        const lineNumber = lineNo(source, start);
        const line = source.split('\n')[lineNumber - 1] ?? '';
        const snippet = snippetFor(match);
        const category = classify(path.relative(ROOT, file), line, snippet);
        candidates.push({ file: path.relative(ROOT, file), line: lineNumber, category, snippet });
      }
    }
  }

  const categoryCounts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const c of candidates) categoryCounts[c.category] += 1;

  const openReleaseRelevant = candidates.filter(c => c.category === 'A' || c.category === 'B');
  return {
    rawCandidates: candidates.length,
    categoryCounts,
    realCustomerVisibleUnlocalized: openReleaseRelevant.length,
    releaseRelevantOpen: openReleaseRelevant.length,
    connectCandidates: candidates.filter(c => c.file.startsWith('features/connect/')).length,
    openReleaseRelevant,
  };
}

const result = scan();
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`Raw candidates: ${result.rawCandidates}`);
  console.log(`Category counts: ${JSON.stringify(result.categoryCounts)}`);
  console.log(`Customer-visible unlocalized: ${result.realCustomerVisibleUnlocalized}`);
  console.log(`Release-relevant open: ${result.releaseRelevantOpen}`);
  if (result.openReleaseRelevant.length) {
    for (const item of result.openReleaseRelevant.slice(0, 50)) {
      console.log(`${item.category} ${item.file}:${item.line} ${item.snippet}`);
    }
  }
}
