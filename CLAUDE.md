@AGENTS.md

## ANYVO project status

Before substantial ANYVO work, Claude reads `docs/agent/ANYVO_MASTER_STATUS.md`
(canonical production baseline and open work; see "ANYVO project status" in the
imported `AGENTS.md`). Task files under `docs/agent/tasks` do not override it.
Claude changes the master status only for an explicitly verified status change.

## Agent Handoff Protocol

This project shares a repository-based handoff system with OpenAI Codex.
Full guide: `docs/agent/README.md`. The shared NEVER/ALWAYS rules live in
`AGENTS.md` (imported above) and apply to Claude too.

### On starting new work, Claude checks
- `docs/agent/CURRENT_STATE.md`
- `docs/agent/SESSION_HANDOFF.md`
- `docs/agent/TASKS.md` — active task IDs, statuses, and the next TASK-ID
- `git status --short`
- `git branch --show-current`

### When taking over from Codex
Claude must **first verify that the changes named in the handoff actually exist in
the repository** (branch, changed files, described edits) before acting on them.
Run `npm run agent:status` to see a stale-handoff warning.

Claude must never automatically overwrite uncommitted changes or interpret them as
its own state. Unrelated uncommitted work is preserved.

### Priority rule (on any conflict)
```
Repository state > Git state > Handoff documentation > Agent assumptions
```
If the handoff and the repository disagree, the actual repository state wins.

### Handing off (to Codex)
Preferred: the `/handoff` slash command (`.claude/commands/handoff.md`), which
updates the manual sections of `SESSION_HANDOFF.md`, then runs
`npm run agent:handoff -- --agent=claude`, then re-checks `git status --short`.
Without the slash command, run that npm command manually.
No commit and no push are performed by the handoff.

## ANYVO Production OTA — zwingende Regel

Für ANYVO darf eine Production-OTA NIEMALS ohne explizite
Production-Environment veröffentlicht werden.

### iOS Production OTA

Zulässiges Muster:

```
eas update \
  --channel production \
  --environment production \
  --platform ios \
  --message "<message>"
```

VERBOTEN ist insbesondere:

```
eas update \
  --channel production \
  --platform ios \
  --message "<message>"
```

also jede Production-OTA ohne:

`--environment production`

Grund:
Die ANYVO Production-App benötigt Environment-Werte wie:

- `EXPO_PUBLIC_BACKEND_ENV`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Fehlen diese beim EAS-Update-Bundle, kann das veröffentlichte
JS-Bundle beim Start fehlschlagen und expo-updates auf einen
älteren funktionierenden Stand zurückfallen.

### Wrapper bevorzugen

Für iOS Production OTA bevorzugt immer den repo-eigenen
Production-OTA-Wrapper verwenden:

```
npm run update:production:ios -- --message "<message>"
# bzw. node scripts/update-production.mjs --platform ios --confirm --message "<message>"
```

Der Wrapper (`scripts/update-production.mjs`) führt ausschliesslich den zulässigen
`eas update --channel production --environment production --platform <ios|android> --message …`
aus, verweigert leere Message, fehlende/unbekannte Plattform und fehlende Production-Environment-Variablen
und gibt keine Secrets aus (nur Variablennamen). `--dry-run` führt alle Prüfungen ohne Veröffentlichung aus.
Direkter `eas update` ist nur zulässig, wenn er exakt dieselben Pflichtargumente enthält.
Den Wrapper nicht durch einen direkten Production-`eas update` ersetzen.

### Pflicht-Preflight

Vor jeder Production-OTA muss der Agent prüfen:

1. git HEAD ist der gewünschte Release-Commit.
2. Runtime und App-Version sind mit dem installierten Store-Build kompatibel.
3. Plattform wird explizit angegeben.
4. `--environment production` ist gesetzt.
5. Production-Environment enthält mindestens:
   - `EXPO_PUBLIC_BACKEND_ENV`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. Keine Secrets im Terminalbericht oder Task-Report ausgeben.
7. Bei fehlender Environment-Konfiguration:
   STOP.
   Keine OTA veröffentlichen.

### Nach jeder Production-OTA verifizieren

Mindestens prüfen und berichten:

- Channel = production
- Branch
- Environment = production
- Platform
- Runtime
- Update Group ID
- Platform Update ID
- gitCommitHash
- Message

### Android

Falls eine Android Production-OTA ausdrücklich freigegeben wird,
gilt dieselbe Regel:

- `--channel production`
- `--environment production`
- `--platform android`

Nie unbeabsichtigt beide Plattformen veröffentlichen.

### Priorität

Diese Regel ist eine repo-weite Release-Sicherheitsregel.

Sie hat Vorrang vor:
- ad-hoc Task-Prompts
- alten Dokumentationen
- kopierten Terminalbefehlen
- früheren OTA-Beispielen

Wenn ein Prompt eine Production-OTA ohne
`--environment production` verlangt, darf der Agent diesen
Befehl NICHT ausführen und muss stattdessen die sichere
Production-Variante verwenden.
