# 08 — UI & Navigation Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme von Navigation, UI-Komponentenbibliothek, Theming/Styling und i18n.

## Gefundene Dateien

- Navigation: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/unit/_layout.tsx`, `app/trainer/_layout.tsx`, `app/index.tsx`.
- UI-Bibliothek: `components/ui/*` (`AnyvoButton`, `AnyvoCard`, `AnyvoChip`, `AnyvoPill`, `AnyvoStatCard`, `AnyvoBottomSheet`, `Button`, `Card`, `Input`, `Toast`, `Glass`, `PremiumGate`, `ProgressRing`, `PhotoPicker`, `SignedImage`, `SoftBoundary`, `DurationDrumPicker`, Icons …).
- Feature-UI: `components/dogs/*`, `components/training/*`, `components/calendar/*`, `components/analytics/*`, `components/tracking/*`, `features/*/components|screens`.
- Theming: `constants/colors.ts` (`C`), `constants/theme.ts`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `hooks/use-theme-color.ts`, `hooks/use-color-scheme.ts`.
- i18n: `i18n/config.ts`, `i18n/index.ts`, `i18n/de-CH.ts`, `de-DE.ts`, `gsw-CH.ts`, `i18n/format.ts`, `i18n/locales/{de,fr,gsw}.ts`, `app/language.tsx`, `services/localeSync.ts`, `SUPABASE_USER_LOCALE.sql`.
- Tests: `components/ui/__tests__/AnyvoButton.test.tsx`, `i18n/__tests__/i18n.test.ts`.

## Navigation (Details)

- **Expo Router, typed routes**, dark-only (`app.json` `userInterfaceStyle:'dark'`).
- Root-Stack ohne Header; Modals: `modal`, `add-dog`, `edit-dog`, `connect/profil-bearbeiten` (`presentation:'modal'`); `track/legen` als `fullScreenModal` mit `gestureEnabled:false`.
- Tabs: `home | dogs | training | [hub|analytics exklusiv] | (connect?) | profile`; `clients`/`activity` versteckt (`href:null`), aus Hub erreichbar. Rollen-/Flag-gesteuert (`useCapabilities().isTrainerModule`, `CONNECT_ENABLED`).
- Auth-Gate: `app/index.tsx` → Redirect nach Session; `(tabs)/_layout.tsx` → `Redirect` auf `/(auth)/login` ohne Session.
- Tab-Bar-Hintergrund: iOS 26+ Liquid Glass (`expo-glass-effect`) sonst `expo-blur` (`components/ui/Glass.tsx` `isGlass`). Edge-to-Edge/Insets via `useSafeAreaInsets` (Android 15).
- Haptik-Tab: `components/haptic-tab.tsx`.

## Theming / Styling (gemischt)

- **Zwei parallele Styling-Ansätze:** NativeWind/Tailwind (`className`) **und** `StyleSheet.create` + Farb-Tokens `constants/colors.ts` (`C.bg`, `C.accent`, `C.track*` …). Viele Screens nutzen `StyleSheet` + `C`, nicht Tailwind.
- Fährten-eigene Farbtokens `C.track*` (Primary/Warning/Danger/Blue/Purple) für Teilstrecken/Karten.

## i18n (mehrdeutig)

- Zwei parallele Locale-Strukturen: `i18n/{de-CH,de-DE,gsw-CH}.ts` **und** `i18n/locales/{de,fr,gsw}.ts`. **[UNKLAR]** welche kanonisch ist / ob `fr` aktiv genutzt wird.
- Sprache aus Profil synchronisiert (`services/localeSync.ts`, an Login gekoppelt in `lib/session-context.tsx`).
- Beobachtung: viele UI-Strings sind **hart auf Deutsch/Schweizerdeutsch** codiert (z. B. Fährten-Ansagen in `trackSegments.ts`, Tab-Titel in `(tabs)/_layout.tsx`) — nicht über i18n geführt.

## Tatsächlicher Datenfluss

Screens konsumieren UI-Komponenten + Hooks; Rollen/Flags steuern Sichtbarkeit (`useCapabilities`, `useSession`, `CONNECT_ENABLED`). Push-Taps routen zentral in `(tabs)/_layout.tsx`.

## Bestehende Abhängigkeiten

- `expo-router`, `@react-navigation/*` (gepinnt), `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`, `expo-blur`/`expo-glass-effect`, `nativewind`, `i18next`/`react-i18next`.

## Aktuelle Regeln

- `docs/00_READ_FIRST.md`: Screens stellen nur dar (keine Fachlogik/keine direkten DB-Zugriffe); plattformneutral iOS/Android.

## Inkonsistenzen

- Doppeltes Styling-Paradigma (Tailwind vs. StyleSheet+Tokens) ohne dokumentierte Abgrenzung.
- Doppelte i18n-Struktur; teils hartcodierte Strings statt i18n.
- Component-Duplikate über Ordnergrenzen (`components/analytics/AICoachCard.tsx` vs. `features/ai/components/AiCoachCard.tsx`; `RecommendationCard` doppelt; `components/tracking/TrackMap.tsx` vs. `features/tracking/components/TrackingMap.tsx`).

## Offene Fragen

- Welche i18n-Struktur ist Ziel? Ist Französisch (`fr`) im Scope?
- Soll Styling auf NativeWind vereinheitlicht werden oder bleibt der Mischbetrieb?
- Welche `TrackMap`/`AICoachCard`-Variante ist aktiv?

## Technische Risiken

- Duplizierte Komponenten → inkonsistente UI und doppelte Wartung.
- Hartcodierte Sprache erschwert echte Mehrsprachigkeit.

## Mögliche spätere Verbesserungen

- Styling- und i18n-Strategie festschreiben; Duplikate zusammenführen.
- UI-Strings konsequent über i18n führen.
