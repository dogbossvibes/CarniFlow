// Wahl von Sprache und Offline-Erkennung für die Sprachsteuerung (Spec 03, Punkt 8).
// Offline bevorzugt: nur wenn das Gerät On-Device-Erkennung kann UND ein
// deutsches Sprachpaket installiert ist. Sonst Erkennung über Apple/Google
// (Hinweis in der Oberfläche, Datenschutz-Erklärung im PR B).

export interface RecognitionSetup { lang: string; onDevice: boolean }

const norm = (l: string) => l.replace('_', '-').toLowerCase();

export function chooseRecognitionSetup(input: {
  supportsOnDevice: boolean;
  installedLocales: readonly string[];
  preferOffline?: boolean;
}): RecognitionSetup {
  const installed = new Set(input.installedLocales.map(norm));
  if (input.preferOffline !== false && input.supportsOnDevice) {
    for (const lang of ['de-CH', 'de-DE', 'de-AT', 'de']) {
      if (installed.has(norm(lang))) return { lang: lang === 'de' ? 'de-DE' : lang, onDevice: true };
    }
  }
  return { lang: 'de-DE', onDevice: false };
}
