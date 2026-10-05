import ActivityKit
import Foundation

// ─────────────────────────────────────────────────────────────────────────
// Liegezeit-Live-Activity V2 — EINZIGE Schema-Definition.
// Diese Datei wird unverändert zusätzlich in das Widget-Target `LiveActivity`
// kopiert (plugins/withAnyvoRestingLiveActivity.js) — App und Widget teilen so
// exakt dasselbe Codable-Schema. ActivityKit ordnet Activities über den
// Typnamen zu: bewusst ein NEUER Typ (nicht das V1-`LiveActivityAttributes`
// von expo-live-activity), damit laufende V1-Activities nie mit einem anderen
// Schema dekodiert werden müssen.
//
// Nur Darstellung + Identität. KEINE GPS-Daten, Route, Account-ID, Tokens,
// Diagnosedaten oder Pfade. Die Activity ist NIE Source of Truth für den
// Fährten-Zustand (offen/abgebrochen/abgeschlossen/Hund) — das bleiben
// persistierte Fährte + Active-Track-Registry + lokaler Zustand.
// ─────────────────────────────────────────────────────────────────────────
@available(iOS 16.1, *)
struct AnyvoRestingActivityAttributes: ActivityAttributes {
  /// Nichts Veränderliches: die laufende Zeit rendert SwiftUI selbst aus
  /// `lyingStartedAt` (kein sekündliches Update, kein JS-Timer).
  public struct ContentState: Codable, Hashable {}

  /// Identität (exakte Zuordnung für start/end/rehydrate).
  var dogId: String
  var sessionId: String
  /// Darstellung: beim Start bekannter Anzeigename des Hundes.
  var dogName: String
  /// Fachlicher Beginn der Liegezeit (persistierter Zeitstempel der Fährte).
  var lyingStartedAt: Date
  /// Bereits lokalisierte Beschriftungen aus dem ANYVO-i18n (App-Sprache).
  var lyingLabel: String
  var sinceLabel: String
  /// Vollständige Deep-Link-URL auf genau diese Fährte (anyvo://track/liegen?dogId=…&id=…).
  var deepLinkUrl: String
}
