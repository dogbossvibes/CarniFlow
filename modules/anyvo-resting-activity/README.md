# anyvo-resting-activity

Liegezeit-Live-Activity **V2** (iOS ≥ 16.2, ActivityKit) — eine Activity je offener Fährte,
eindeutig über `dogId` + `sessionId`. Nur Darstellung; Source of Truth bleiben persistierte
Fährte + Active-Track-Registry.

- `ios/AnyvoRestingActivityAttributes.swift` — einzige Schema-Definition (wird zusätzlich ins
  Widget-Target kopiert, siehe `plugins/withAnyvoRestingLiveActivity.js`).
- `ios/RestingActivityController.swift` — start/end/list/endLegacyResting (exakte Zuordnung).
- `widget/AnyvoRestingActivityWidget.swift` — Sperrbildschirm + Dynamic Island, Timer nativ
  per `Text(timerInterval:countsDown:false)`.
- Änderungen hier erfordern einen **nativen Build** (keine OTA).
