import SwiftUI
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
// ANYVO Schnellstart-Widget (Home-Bildschirm, systemSmall/systemMedium).
// Reine App-Navigation über WidgetKit-Mittel (widgetURL/Link) auf bestehende
// Production-Routen. KEINE Business-Logik, keine Daten, kein Netzwerk, keine
// Session, kein GPS, keine App Group. „Fährte legen" öffnet nur den bestehenden
// Vorbereitungs-Screen — die Aufnahme startet erst nach ausdrücklichem Tippen dort.
// Wird per plugins/withAnyvoRestingLiveActivity.js in das bestehende Widget-Target
// `LiveActivity` kopiert und im WidgetBundle registriert (kein zweites Target).
// Texte: Localizable.xcstrings des Widget-Targets (de/en/fr/it).
// ─────────────────────────────────────────────────────────────────────────

/// Feste Production-Ziele (Schema `anyvo`).
enum AnyvoQuickStartDestination {
  static let tracks = URL(string: "anyvo://track")!
  static let layTrack = URL(string: "anyvo://track/legen")!
  static let logbook = URL(string: "anyvo://track/historie")!
}

private enum QuickStartStyle {
  static let mint = Color(red: 21 / 255, green: 230 / 255, blue: 195 / 255)   // ANYVO Mint #15E6C3
  static let background = Color(red: 15 / 255, green: 17 / 255, blue: 21 / 255) // #0F1115
  static let tile = Color.white.opacity(0.08)
}

struct AnyvoQuickStartEntry: TimelineEntry {
  let date: Date
}

/// Statischer Inhalt: ein Eintrag, nie neu laden (kein Polling, kein Netzwerk).
struct AnyvoQuickStartProvider: TimelineProvider {
  func placeholder(in context: Context) -> AnyvoQuickStartEntry { AnyvoQuickStartEntry(date: Date()) }
  func getSnapshot(in context: Context, completion: @escaping (AnyvoQuickStartEntry) -> Void) {
    completion(AnyvoQuickStartEntry(date: Date()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<AnyvoQuickStartEntry>) -> Void) {
    completion(Timeline(entries: [AnyvoQuickStartEntry(date: Date())], policy: .never))
  }
}

private extension View {
  @ViewBuilder
  func quickStartBackground() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(QuickStartStyle.background, for: .widget)
    } else {
      background(QuickStartStyle.background)
    }
  }
}

/// systemSmall: ein primärer Pfad — „Fährte legen" (Tippen auf das ganze Widget).
private struct QuickStartSmallView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("qs.brand")
        .font(.caption.weight(.bold))
        .foregroundStyle(QuickStartStyle.mint)
      Spacer(minLength: 0)
      Image(systemName: "plus.circle.fill")
        .font(.title2)
        .foregroundStyle(QuickStartStyle.mint)
        .accessibilityHidden(true)
      Text("qs.layTrack")
        .font(.headline)
        .foregroundStyle(.white)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .widgetURL(AnyvoQuickStartDestination.layTrack)
  }
}

private struct QuickStartAction: View {
  let titleKey: LocalizedStringKey
  let symbol: String
  let url: URL
  let primary: Bool

  var body: some View {
    Link(destination: url) {
      VStack(spacing: 6) {
        Image(systemName: symbol)
          .font(.title3)
          .foregroundStyle(primary ? QuickStartStyle.mint : .white)
          .accessibilityHidden(true)
        Text(titleKey)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(2)
          .multilineTextAlignment(.center)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(QuickStartStyle.tile))
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}

/// systemMedium: drei eindeutige Aktionen.
private struct QuickStartMediumView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("qs.brand")
        .font(.caption.weight(.bold))
        .foregroundStyle(QuickStartStyle.mint)
      HStack(spacing: 8) {
        QuickStartAction(titleKey: "qs.tracks", symbol: "map", url: AnyvoQuickStartDestination.tracks, primary: false)
        QuickStartAction(titleKey: "qs.layTrack", symbol: "plus.circle.fill", url: AnyvoQuickStartDestination.layTrack, primary: true)
        QuickStartAction(titleKey: "qs.logbook", symbol: "book.closed", url: AnyvoQuickStartDestination.logbook, primary: false)
      }
    }
  }
}

struct AnyvoQuickStartWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var body: some View {
    Group {
      if family == .systemMedium {
        QuickStartMediumView()
      } else {
        QuickStartSmallView()
      }
    }
    .quickStartBackground()
  }
}

struct AnyvoQuickStartWidget: Widget {
  let kind = "AnyvoQuickStart"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: AnyvoQuickStartProvider()) { _ in
      AnyvoQuickStartWidgetView()
    }
    .configurationDisplayName("qs.displayName")
    .description("qs.description")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
