import { gswCH } from '../gsw-CH';

// ── Schwiizerdütsch (gsw) ──
// Texte 1:1 aus dem bestehenden gsw-CH Override-Dictionary (Reuse → identisch).
// Fehlende Keys fallen automatisch auf `de` zurück (fallbackLng). Ergänzt um die
// Plural-Referenzkeys im gsw-Stil.
export const gsw = {
  "trainingTemplate.resume": "Entwurf wiitermache",
  "trainingTemplate.resumeHelp": "Für die Vorlag gits scho en Entwurf. Mach det wiiter; dini Iigabe bliibed erhalte.",

  "trainingTemplate.open": "Als Vorlag übernäh",
  "trainingTemplate.explanation": "Wähl Üebige und offeni Schwerpünkt für es neus Training. Bewertige, Beobachtige, Medie und Ziite bliibed im ursprüngliche Iitrag.",
  "trainingTemplate.hints": "Offeni Schwerpünkt uswähle",
  "trainingTemplate.noHints": "Kei offeni Schwerpünkt vorhande.",
  "trainingTemplate.confirm": "Uswahl übernäh",
  "trainingTemplate.context": "Vorlag vom {date}",
  "trainingTemplate.contextHelp": "Die Hiwiis sind us früehere Trainings. Dokumentier drunder, wie s hüt gloffe isch.",

  "track.report.glyphNotice": "Es paar Zeiche werded als ? zeigt. D JSON-Datei enthält de vollständigi Text.",
  "track.export.title": "Uuswärtig exportiere",
  "track.export.privacy": "Exportdateien enthalten genaue Standorte, das Datum und den Hundenamen. Teile sie nur mit Personen, denen du diese Daten geben möchtest.",
  "track.export.notes": "Notize mitnäh",
  "track.export.pdf": "PDF-Bericht",
  "track.export.gpx": "GPX-Spure",
  "track.export.json": "Fährte-Datei (JSON)",
  "track.export.failed": "Der Export konnte nicht erstellt oder geteilt werden. Deine Fährte bleibt unverändert.",
  "track.export.unavailable": "Keine gespeicherte Geometrie vorhanden.",
  "track.report.title": "Fährtenbericht",
  "track.report.reference": "Gelegte Fährte",
  "track.report.search": "Aufgezeichnete Absuche",
  "track.report.duration": "Dauer",
  "track.report.objects": "Gegenstände",
  "track.report.score": "Analyse-Score",
  "track.report.confidence": "Datengrundlage",
  "track.report.conditions": "Bedingungen beim Legen",
  "track.report.notes": "Notizen",
  "track.report.map": "Fährtenverlauf · schematisch, Norden oben",
  "track.report.source": "Die Suchspur zeigt die Position des Aufzeichnungsgeräts. Bei einem Smartphone am Hundeführer ist sie keine gemessene Hundespur. Der Analyse-Score ist keine Prüfungsnote.",
  "track.report.unknown": "Nicht erfasst",
  "track.report.date": "Datum",
  "track.pace.history": "Tempovergliich: {count} früehneri Absuche vo dem Hund.",
  "track.pace.session": "Tempovergliich innerhalb vo dere Absuche.",
  "track.pace.missing": "Z wenig verlässlechi Date für en Tempovergliich.",
  "track.pace.meaning": "Tempo des Aufzeichnungsgeräts; daraus lässt sich nicht sicher ableiten, ob der Hund arbeitet oder rennt.",
  "track.pace.legend": "Langsamer · ähnlich · schneller als das Vergleichstempo",

  ...gswCH,
  trainingCount_one:   '{count} Training',
  trainingCount_other: '{count} Trainings',
  minuteCount_one:     '{count} Minute',
  minuteCount_other:   '{count} Minute',
  articleCount_one:    '{count} Gegestand',
  articleCount_other:  '{count} Gegeständ',
};
