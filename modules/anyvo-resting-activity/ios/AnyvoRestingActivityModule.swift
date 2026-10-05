import ActivityKit
import ExpoModulesCore

struct RestingActivityStartInput: Record {
  @Field var dogId: String = ""
  @Field var sessionId: String = ""
  @Field var dogName: String = ""
  @Field var lyingStartedAtMs: Double = 0
  @Field var lyingLabel: String = ""
  @Field var sinceLabel: String = ""
  @Field var deepLinkUrl: String = ""
}

// Dünne Expo-Bridge über RestingActivityController. Kein Polling, kein Timer:
// die Bridge wird nur bei Start/Ende/Rehydration aufgerufen.
public class AnyvoRestingActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnyvoRestingActivity")

    Function("isSupported") { () -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Startet (oder findet) die Activity für genau diese dogId + sessionId. nil = nicht möglich.
    Function("start") { (input: RestingActivityStartInput) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      // Ohne eindeutige Identität keine Activity (fail closed).
      guard !input.dogId.isEmpty, !input.sessionId.isEmpty, input.lyingStartedAtMs > 0,
            !input.deepLinkUrl.isEmpty
      else { return nil }
      let attributes = AnyvoRestingActivityAttributes(
        dogId: input.dogId,
        sessionId: input.sessionId,
        dogName: input.dogName,
        lyingStartedAt: Date(timeIntervalSince1970: input.lyingStartedAtMs / 1000),
        lyingLabel: input.lyingLabel,
        sinceLabel: input.sinceLabel,
        deepLinkUrl: input.deepLinkUrl
      )
      return try? RestingActivityController.start(attributes)
    }

    AsyncFunction("end") { (dogId: String, sessionId: String) async -> Int in
      guard #available(iOS 16.2, *) else { return 0 }
      guard !dogId.isEmpty, !sessionId.isEmpty else { return 0 }
      return await RestingActivityController.end(dogId: dogId, sessionId: sessionId)
    }

    AsyncFunction("endActivity") { (activityId: String) async -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return await RestingActivityController.end(activityId: activityId)
    }

    Function("list") { () -> [[String: Any]] in
      guard #available(iOS 16.2, *) else { return [] }
      return RestingActivityController.list().map {
        [
          "activityId": $0.activityId,
          "dogId": $0.dogId,
          "sessionId": $0.sessionId,
          "lyingStartedAtMs": $0.lyingStartedAt.timeIntervalSince1970 * 1000,
        ]
      }
    }

    AsyncFunction("endLegacyResting") { () async -> Int in
      guard #available(iOS 16.2, *) else { return 0 }
      return await RestingActivityController.endLegacyResting()
    }
  }
}
