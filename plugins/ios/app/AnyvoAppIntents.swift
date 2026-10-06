import AppIntents
import Foundation

// ─────────────────────────────────────────────────────────────────────────
// ANYVO App Intents + App Shortcuts (Siri, Kurzbefehle, Action Button, Spotlight).
// Liegt im APP-Target (per plugins/withAnyvoRestingLiveActivity.js), damit die
// App-Intents-Metadaten beim Build extrahiert werden.
//
// Ablauf: Der Intent bringt ANYVO in den Vordergrund und hinterlegt GENAU EIN festes
// Navigationsziel in UserDefaults.standard. Die App (React Native) liest es über das
// eingebaute Settings-Modul (RCTSettingsManager, NSUserDefaults) — beim Kaltstart aus
// dem Start-Snapshot, sonst über das Änderungs-Event —, prüft es gegen eine Allowlist,
// navigiert einmal und löscht es (consume-once). Kein UIApplication.open, kein
// OpenURLIntent (verlangt Universal Links), keine App Group, kein Netzwerk, keine
// Session- oder Hundedaten, keine beliebigen URLs aus Siri.
// ─────────────────────────────────────────────────────────────────────────

/// Feste Navigationsziele (Allowlist, identisch zu features/appIntents/pendingIntentRoute.ts).
enum AnyvoIntentRoute: String {
  case tracks = "track"
  case layTrack = "track/legen"
  case logbook = "track/historie"
}

/// Einziger Übergabe-Slot an die App. Wert: "<route>|<epochMs>|<id>".
enum AnyvoPendingIntentRoute {
  static let defaultsKey = "anyvo.appIntent.pendingRoute"

  static func store(_ route: AnyvoIntentRoute) {
    let millis = Int64(Date().timeIntervalSince1970 * 1000)
    UserDefaults.standard.set("\(route.rawValue)|\(millis)|\(UUID().uuidString)", forKey: defaultsKey)
  }
}

@available(iOS 16.0, *)
struct AnyvoOpenTracksIntent: AppIntent {
  static var title: LocalizedStringResource = "intent.openTracks.title"
  static var description = IntentDescription("intent.openTracks.description")
  /// Vordergrund für iOS 16–25 (ab iOS 26 gilt supportedModes, siehe unten).
  static var openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    AnyvoPendingIntentRoute.store(.tracks)
    return .result()
  }
}

@available(iOS 16.0, *)
struct AnyvoLayTrackIntent: AppIntent {
  static var title: LocalizedStringResource = "intent.layTrack.title"
  static var description = IntentDescription("intent.layTrack.description")
  static var openAppWhenRun: Bool = true

  /// Öffnet NUR den Vorbereitungs-Screen — startet keine Aufnahme/Session.
  @MainActor
  func perform() async throws -> some IntentResult {
    AnyvoPendingIntentRoute.store(.layTrack)
    return .result()
  }
}

@available(iOS 16.0, *)
struct AnyvoOpenLogbookIntent: AppIntent {
  static var title: LocalizedStringResource = "intent.openLogbook.title"
  static var description = IntentDescription("intent.openLogbook.description")
  static var openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    AnyvoPendingIntentRoute.store(.logbook)
    return .result()
  }
}

// iOS 26+: primärer, nicht-deprecated Weg in den Vordergrund.
@available(iOS 26.0, *)
extension AnyvoOpenTracksIntent {
  static var supportedModes: IntentModes { .foreground(.immediate) }
}

@available(iOS 26.0, *)
extension AnyvoLayTrackIntent {
  static var supportedModes: IntentModes { .foreground(.immediate) }
}

@available(iOS 26.0, *)
extension AnyvoOpenLogbookIntent {
  static var supportedModes: IntentModes { .foreground(.immediate) }
}

/// Veröffentlicht die Intents für Siri, Kurzbefehle und die Action-Button-Auswahl.
/// Phrasen enthalten den App-Namen; Übersetzungen in AppShortcuts.xcstrings (de/fr/it).
@available(iOS 16.0, *)
struct AnyvoAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AnyvoOpenTracksIntent(),
      phrases: [
        "Open tracks with \(.applicationName)",
        "Show my tracks in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: AnyvoLayTrackIntent(),
      phrases: [
        "Lay a track with \(.applicationName)",
        "Start laying a track in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: AnyvoOpenLogbookIntent(),
      phrases: [
        "Open \(.applicationName) logbook",
        "Show my logbook in \(.applicationName)",
      ]
    )
  }
}
