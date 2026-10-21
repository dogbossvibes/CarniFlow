import SwiftUI

@main
struct AnyvoWatchApp: App {
  @StateObject private var model = WatchSessionModel()
  @Environment(\.scenePhase) private var scenePhase
  var body: some Scene {
    WindowGroup {
      NavigationStack { WatchSessionView(model: model) }
        .task { model.setForeground(scenePhase == .active) }
        .onChange(of: scenePhase) { phase in model.setForeground(phase == .active) }
    }
  }
}
