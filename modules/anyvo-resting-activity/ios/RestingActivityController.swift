import ActivityKit
import Foundation

// Reine ActivityKit-Logik (ohne Expo) — jede Operation wirkt NUR auf die
// Activity mit exakt passender dogId + sessionId. Kein „latest/first/last"-
// Fallback, kein Singleton: mehrere Hunde haben gleichzeitig eigene Activities.
@available(iOS 16.2, *)
enum RestingActivityController {
  struct Info {
    let activityId: String
    let dogId: String
    let sessionId: String
    let lyingStartedAt: Date
  }

  /// V1-Liegezeit-Activities erkennt man an ihrem Deep-Link (die Lege-Activity nutzt /track/legen).
  static let legacyRestingDeepLinkPrefix = "/track/liegen"

  static func isLive(_ state: ActivityState) -> Bool {
    state == .active || state == .stale
  }

  /// UI-Priorisierung: die zuletzt begonnene Liegezeit ist am relevantesten.
  /// Deterministisch aus dem fachlichen Zeitstempel → bleibt beim Wiederaufbau gleich.
  static func relevanceScore(for lyingStartedAt: Date) -> Double {
    lyingStartedAt.timeIntervalSince1970
  }

  static func list() -> [Info] {
    Activity<AnyvoRestingActivityAttributes>.activities
      .filter { isLive($0.activityState) }
      .map {
        Info(activityId: $0.id, dogId: $0.attributes.dogId, sessionId: $0.attributes.sessionId,
             lyingStartedAt: $0.attributes.lyingStartedAt)
      }
  }

  /// Idempotent: existiert für GENAU diese dogId + sessionId bereits eine Activity, wird sie
  /// zurückgegeben statt eine zweite anzulegen. Andere Hunde/Sessions bleiben unberührt.
  static func start(_ attributes: AnyvoRestingActivityAttributes) throws -> String {
    if let existing = Activity<AnyvoRestingActivityAttributes>.activities.first(where: {
      isLive($0.activityState)
        && $0.attributes.dogId == attributes.dogId
        && $0.attributes.sessionId == attributes.sessionId
    }) {
      return existing.id
    }
    let activity = try Activity.request(
      attributes: attributes,
      content: ActivityContent(
        state: AnyvoRestingActivityAttributes.ContentState(),
        staleDate: nil,
        relevanceScore: relevanceScore(for: attributes.lyingStartedAt)
      ),
      pushType: nil
    )
    return activity.id
  }

  /// Beendet ausschliesslich Activities mit exakt dieser dogId + sessionId.
  static func end(dogId: String, sessionId: String) async -> Int {
    let matches = Activity<AnyvoRestingActivityAttributes>.activities.filter {
      $0.attributes.dogId == dogId && $0.attributes.sessionId == sessionId
    }
    for activity in matches {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    return matches.count
  }

  /// Beendet genau eine Activity (Rehydration: per Liste ermittelte verwaiste/falsche Activity).
  static func end(activityId: String) async -> Bool {
    guard let activity = Activity<AnyvoRestingActivityAttributes>.activities.first(where: { $0.id == activityId })
    else { return false }
    await activity.end(nil, dismissalPolicy: .immediate)
    return true
  }

  /// V1-Liegezeit-Activities (ohne dogId) beenden — nie umhängen. Die V1-Lege-Activity bleibt.
  static func endLegacyResting() async -> Int {
    let legacy = Activity<LiveActivityAttributes>.activities.filter {
      ($0.attributes.deepLinkUrl ?? "").hasPrefix(legacyRestingDeepLinkPrefix)
    }
    for activity in legacy {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    return legacy.count
  }
}
