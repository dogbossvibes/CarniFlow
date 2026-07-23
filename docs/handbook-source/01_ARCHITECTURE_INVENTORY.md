# 01 — Architecture Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes. Keine Codeänderungen außer im Schlussabschnitt.

## Zweck

Bestandsaufnahme der App-Architektur: Bootstrap, Navigation, State Management, Service-/Hook-Schichten, Provider-Baum.

## Gefundene Dateien (zentral)

- Bootstrap/Provider: `app/_layout.tsx`, `lib/session-context.tsx`, `lib/queryClient.ts`, `lib/monitoring.ts`.
- Navigation: `app/_layout.tsx` (Root-Stack), `app/(tabs)/_layout.tsx` (Tabs), `app/index.tsx` (Redirect-Gate), `app/(auth)/_layout.tsx`, `app/unit/_layout.tsx`, `app/trainer/_layout.tsx`.
- State: `features/tracking/store/*` (Zustand), `features/sync/store/syncStore.ts`, `features/voice/store/voiceStore.ts`, `stores/*` (3), diverse Feature-Stores.
- Services: `services/*.ts` (31), Feature-`services/`-Ordner (`features/*/services|api`).
- Hooks: `hooks/*.ts` (28) + Feature-Hooks (`features/*/hooks`).

## Provider-Baum (`app/_layout.tsx`)

Reihenfolge (außen→innen): `GestureHandlerRootView` → `QueryClientProvider` (`lib/queryClient.ts`) → `SessionProvider` (`lib/session-context.tsx`) → `StatusBar` + `SyncProvider` (`features/sync/components/SyncProvider.tsx`) → `Stack` → `AppLockGate` (`components/AppLockGate.tsx`).

Boot-Seiteneffekte beim Modul-Laden (Top-Level in `app/_layout.tsx`):
- Polyfills zuerst (`react-native-get-random-values`, `react-native-url-polyfill/auto`, `@/lib/crypto-polyfill`).
- Import registriert Hintergrund-GPS-Task (`@/features/tracking/native/backgroundLocationTask`).
- `void initMonitoring()` (Sentry, no-op ohne DSN/Opt-out).
- `void useActiveFaehrten.getState().hydrate()` — lädt Aktive-Fährten-Registry aus lokalem Speicher, **login-unabhängig**.
- Globale `ErrorBoundary` (Render-Fehler-Fallback, meldet via `captureError`).

## Session-/Auth-Bootstrap (`lib/session-context.tsx`)

- `SessionProvider` hält `{ session, user, loading }`; `useSession()` als Hook (dupliziert als `hooks/useSession.ts` — **[UNKLAR]** welche Version kanonisch ist; `app/_layout.tsx` importiert aus `@/lib/session-context`, `app/(tabs)/_layout.tsx` aus `@/hooks/useSession`).
- Bootstrap-Absicherung: `getSession()` mit try/catch + **8 s Safety-Timeout**; `onAuthStateChange`-Subscription; `initLocaleSync`/`stopLocaleSync` an Login gekoppelt.
- `app/index.tsx` ist zusätzlich mit 10 s-Timeout-Karte abgesichert (Anti-Endless-Spinner).

## Navigation (Expo Router, typed routes)

- **Root-Stack** (`app/_layout.tsx`), `headerShown:false`. Registrierte Screens u. a.: `index`, `(auth)`, `(tabs)`, `auth/callback`, `dog/[id]`, `modal`/`add-dog`/`edit-dog` (presentation `modal`), `training/[id]`, `track/index|historie|[id]`, `track/legen` (`fullScreenModal`, `gestureEnabled:false`), `analyse/*`, `sync`, `connect/*`, `dev/offline-debug`.
- **Tabs** (`app/(tabs)/_layout.tsx`): `home`, `dogs`, `training`, dann **Slot 4 exklusiv** `hub` (Trainer) **oder** `analytics` (Kunde) via `href: isTrainerModule ? … : null`, plus `profile`. `connect`-Tab nur bei `CONNECT_ENABLED`. `clients`/`activity` sind `href:null` (aus Hub erreichbar).
- Fährten haben **keinen eigenen Tab** — Einstieg über Training → „Fährte (GPS)".
- Push-/Notification-Routing in `app/(tabs)/_layout.tsx` (`data.type` → `router.push`), inkl. Cold-Start via `getLastNotificationResponseAsync`.

## State Management (tatsächlich, gemischt)

Drei parallele Mechanismen:
1. **Zustand-Stores** (imperativer Domain-State), v. a. Tracking: `useTrackingStore` (`features/tracking/store/trackingStore.ts`), `useActiveFaehrten`, `restingTime`, `searchPersist`/`searchRecovery`; ferner `useSyncStore`, `voiceStore`, `stores/activeTraining|homeLayout|liveBarScroll`.
2. **React Query** (`lib/queryClient.ts`) für Server-State über `hooks/use*`-Wrapper.
3. **React Context** für Session (`lib/session-context.tsx`).

## Service-/Hook-Schichten

- `services/*` kapseln Supabase-Zugriffe (viele geben rohe Supabase-Query-Builder oder `{ data, error }` zurück). Feature-Module haben eigene `services/`/`api/`/`repositories/`.
- Hooks in `hooks/` sind meist React-Query-Wrapper (z. B. `useDogs`, `useTrackSessions`, `useCapabilities`, `useTrainer`) plus Setting-Hooks (`useAppLockSetting`, `useVolumeKeyArticleSetting` …).

## Tatsächlicher Datenfluss (typisch)

Screen (`app/**`) → Hook (`hooks/**` / `features/**/hooks`) → Service (`services/**` / `features/**/services`) → `supabase` (`lib/supabase.ts`). Für Tracking zusätzlich: Screen → `useTrackRecorder`/`useSearchRecorder` → `useTrackingStore` (+ SQLite-Repos + `trackService`).

## Bestehende Abhängigkeiten

- Alle Netzwerkpfade hängen an `lib/supabase.ts` (Singleton-Client, PKCE, AsyncStorage-Session, AppState-AutoRefresh).
- Query-Client global (`lib/queryClient.ts`).
- Native Boot-Kopplung: Tracking-Hintergrundtask + Aktive-Fährten-Hydrate werden **beim App-Start** initialisiert (nicht lazy).

## Aktuelle Regeln

- Handbuch-Prinzipien (`docs/00_READ_FIRST.md`): keine Fachlogik in Screens, keine direkten DB-Zugriffe aus Screens, kleine Verantwortlichkeiten, keine doppelte Datenhaltung.

## Inkonsistenzen

- **`useSession` doppelt** (`lib/session-context.tsx` + `hooks/useSession.ts`) — verschiedene Importpfade in der App. **[UNKLAR]** ob `hooks/useSession.ts` nur re-exportiert (nicht auditiert).
- **Regel „keine direkten DB-Zugriffe aus Screens" vs. Ist:** viele Screens importieren `services/*` direkt; ob Screens `supabase` direkt nutzen, ist **[UNKLAR]** (nicht flächig auditiert) — stichprobenartig laufen Zugriffe über Services.
- Gemischtes State-Paradigma (Zustand + React Query + Context) ohne dokumentierte Abgrenzung, wann welches genutzt wird.

## Offene Fragen

- Welche der beiden `useSession`-Quellen ist die vorgesehene Single Source?
- Gibt es Screens mit direkter `supabase`-Nutzung (Regelverstoß)? → müsste per Grep über `app/**` verifiziert werden.

## Technische Risiken

- Boot-Zeit-Seiteneffekte (GPS-Task-Registrierung, Hydrate) erhöhen Kaltstart-Komplexität; Fehler dort betreffen alle Nutzer.
- Doppelte Session-Hooks → subtile Divergenzen bei Auth-Zustand möglich.

## Mögliche spätere Verbesserungen

- Session-Hook konsolidieren (eine Quelle, überall re-exportiert).
- Verbindliche Konvention dokumentieren: Zustand für Session-/Recording-Live-State, React Query für Server-State.
- Lint-Regel/Review-Check gegen direkte `supabase`-Importe in `app/**`.
