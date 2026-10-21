import SwiftUI

struct WatchSessionView: View {
  @ObservedObject var model: WatchSessionModel
  @State private var confirmEnd = false
  @State private var endSnapshot: WatchSnapshot?
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        Label(model.connected ? "iPhone connected" : "iPhone unavailable", systemImage: model.connected ? "iphone.radiowaves.left.and.right" : "iphone.slash")
          .font(.caption).foregroundStyle(model.connected ? .green : .orange)
        if let snapshot = model.state.snapshot {
          Text(verbatim: displayName(snapshot.dogName)).font(.headline).accessibilityAddTraits(.isHeader)
          Text(LocalizedStringKey(phaseLabel(snapshot.phase))).font(.subheadline)
          if snapshot.contextId != nil && !model.snapshotIsFresh {
            Label("Status expired. Refresh from iPhone.", systemImage: "clock.badge.exclamationmark")
              .font(.caption).foregroundStyle(.orange)
          }
          HStack {
            if let distance = snapshot.distanceM, distance >= 0 {
              Text(distance, format: .number.precision(.fractionLength(0))) + Text(" m")
            }
            Spacer()
            if let seconds = snapshot.elapsedSeconds, seconds >= 0, seconds < 86_400_000 {
              Text(verbatim: String(format: "%02d:%02d", Int(seconds) / 60, Int(seconds) % 60)).monospacedDigit()
            }
          }.font(.caption)
          ForEach(WatchAction.allCases, id: \.rawValue) { action in
            if snapshot.capabilities.contains(action) {
              Button {
                if action == .endPhase { endSnapshot = snapshot; confirmEnd = true } else { model.send(action) }
              } label: {
                Label(LocalizedStringKey(actionLabel(action)), systemImage: actionSymbol(action))
                  .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
              }
              .buttonStyle(.bordered)
              .tint(action == .endPhase ? .orange : .blue)
              .disabled(!model.canSend(action))
            }
          }
        }
        Text(LocalizedStringKey(model.statusKey)).font(.caption).foregroundStyle(.secondary)
          .accessibilityLabel(LocalizedStringKey(model.statusKey))
        if model.state.pending != nil { ProgressView().accessibilityLabel("Waiting for iPhone confirmation…") }
        Button { model.refresh() } label: { Label("Refresh from iPhone", systemImage: "arrow.clockwise") }
          .disabled(!model.connected || model.state.pending != nil)
      }
    }
    .navigationTitle("ANYVO")
    .confirmationDialog("End this phase?", isPresented: $confirmEnd, titleVisibility: .visible) {
      Button("End phase", role: .destructive) {
        if let endSnapshot { model.send(.endPhase, confirmed: true, confirmation: endSnapshot) }
      }
      Button("Cancel", role: .cancel) { }
    } message: {
      Text(verbatim: displayName(endSnapshot?.dogName))
      Text("The iPhone checks and completes this action. No automatic save.")
    }
    .onChange(of: model.state.snapshot?.contextId) { _ in confirmEnd = false; endSnapshot = nil }
    .onChange(of: model.state.snapshot?.revision) { _ in confirmEnd = false; endSnapshot = nil }
  }
  private func displayName(_ name: String?) -> String {
    guard let name, !name.isEmpty else { return "ANYVO" }
    return name
  }
  private func phaseLabel(_ phase: WatchPhase) -> String {
    switch phase {
    case .idle: return "No session prepared"
    case .layPrepared: return "Ready to lay"
    case .layRecording: return "Laying"
    case .layPaused: return "Laying paused"
    case .searchPrepared: return "Ready to search"
    case .searchRecording: return "Searching"
    case .searchPaused: return "Search paused"
    case .finishing: return "Finishing on iPhone"
    case .finished: return "Phase finished"
    }
  }
  private func actionLabel(_ action: WatchAction) -> String {
    switch action {
    case .startLay: return "Start laying"
    case .startSearch: return "Start search"
    case .markObject: return "Mark object"
    case .pause: return "Pause"
    case .resume: return "Resume"
    case .endPhase: return "End phase"
    }
  }
  private func actionSymbol(_ action: WatchAction) -> String {
    switch action {
    case .startLay, .startSearch, .resume: return "play.fill"
    case .markObject: return "mappin.and.ellipse"
    case .pause: return "pause.fill"
    case .endPhase: return "stop.fill"
    }
  }
}
