import ActivityKit
import SwiftUI
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
// Liegezeit-Live-Activity V2 — Sperrbildschirm + Dynamic Island.
// Wird per plugins/withAnyvoRestingLiveActivity.js in das bestehende
// Widget-Target `LiveActivity` (expo-live-activity) kopiert und im
// WidgetBundle registriert. Die laufende Zeit rendert SwiftUI selbst aus
// `lyingStartedAt` — keine JS-Updates, kein Polling.
// Alle Texte kommen bereits lokalisiert aus der App (lyingLabel/sinceLabel);
// der Hundename wird nicht lokalisiert.
// ─────────────────────────────────────────────────────────────────────────

@available(iOS 16.2, *)
private enum RestingStyle {
  static let mint = Color(red: 21 / 255, green: 230 / 255, blue: 195 / 255)        // ANYVO Mint #15E6C3
  static let background = Color(red: 15 / 255, green: 17 / 255, blue: 21 / 255)    // #0F1115 (wie V1)
  static let symbol = "hourglass"                                                    // = Liegezeit-Symbol der App
  /// Kompakter Timer: feste 12 pt (semibold, Monospace-Ziffern). Gemessen (SF, CoreText):
  /// „7:59:59" = 47,3 pt → passt in 48 pt; die kompakte Seite der Dynamic Island hat nur ≈ 50 pt.
  /// Mit Dynamic Type (caption) wären es ab xxxLarge > 56 pt bzw. AX2 81 pt → abgeschnitten.
  static let compactTimerFontSize: CGFloat = 12
  static let compactTimerWidth: CGFloat = 48
}

@available(iOS 16.2, *)
private extension AnyvoRestingActivityAttributes {
  /// Zählt ab dem fachlichen Liegezeit-Beginn hoch. Obergrenze nur technisch nötig
  /// (Live Activities enden spätestens nach 8 h).
  var timerRange: ClosedRange<Date> {
    lyingStartedAt...lyingStartedAt.addingTimeInterval(24 * 60 * 60)
  }

  var url: URL? { URL(string: deepLinkUrl) }
}

@available(iOS 16.2, *)
private struct RestingTimerText: View {
  let attributes: AnyvoRestingActivityAttributes
  var body: some View {
    Text(timerInterval: attributes.timerRange, countsDown: false, showsHours: true)
      .monospacedDigit()
  }
}

@available(iOS 16.2, *)
private struct RestingSinceText: View {
  let attributes: AnyvoRestingActivityAttributes
  var body: some View {
    (Text(attributes.sinceLabel + " ") + Text(attributes.lyingStartedAt, style: .time))
  }
}

// Sperrbildschirm: „Skadi · Liegezeit" / 01:24:36 / „seit 11:10"
@available(iOS 16.2, *)
private struct RestingLockScreenView: View {
  let attributes: AnyvoRestingActivityAttributes

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(attributes.dogName)
            .lineLimit(1)
            .truncationMode(.tail)
            .layoutPriority(1)
          Text("·").accessibilityHidden(true)
          Text(attributes.lyingLabel).lineLimit(1)
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)

        RestingTimerText(attributes: attributes)
          .font(.system(.title, design: .rounded).weight(.bold))
          .foregroundStyle(RestingStyle.mint)
          .lineLimit(1)
          .minimumScaleFactor(0.7)

        RestingSinceText(attributes: attributes)
          .font(.caption)
          .foregroundStyle(.white.opacity(0.6))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Image(systemName: RestingStyle.symbol)
        .font(.title2.weight(.semibold))
        .foregroundStyle(RestingStyle.mint)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
    // Screenreader: „Skadi, Liegezeit, 1 Stunde 24 Minuten, seit 11:10" — keine IDs/Debugdaten.
    .accessibilityElement(children: .combine)
  }
}

@available(iOS 16.2, *)
struct AnyvoRestingActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AnyvoRestingActivityAttributes.self) { context in
      RestingLockScreenView(attributes: context.attributes)
        .activityBackgroundTint(RestingStyle.background)
        .activitySystemActionForegroundColor(RestingStyle.mint)
        .widgetURL(context.attributes.url)
    } dynamicIsland: { context in
      let attributes = context.attributes
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: RestingStyle.symbol)
            .font(.title2.weight(.semibold))
            .foregroundStyle(RestingStyle.mint)
            .accessibilityHidden(true)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 0) {
            Text(attributes.dogName)
              .font(.headline)
              .lineLimit(1)
              .truncationMode(.tail)
            Text(attributes.lyingLabel)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          .accessibilityElement(children: .combine)
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestingTimerText(attributes: attributes)
            .font(.system(.title3, design: .rounded).weight(.bold))
            .foregroundStyle(RestingStyle.mint)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 96, alignment: .trailing)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            // „7:59:59" in title3 rounded bold: xxLarge ≈ 95 pt passt in 96 pt; grösser würde abgeschnitten.
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        }
        DynamicIslandExpandedRegion(.bottom) {
          RestingSinceText(attributes: attributes)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      } compactLeading: {
        Image(systemName: RestingStyle.symbol)
          .foregroundStyle(RestingStyle.mint)
          .accessibilityLabel(Text(attributes.dogName + ", " + attributes.lyingLabel))
      } compactTrailing: {
        // Nur die Zeit (kein Name): Text-Timer sind horizontal flexibel → feste Breite.
        RestingTimerText(attributes: attributes)
          .font(.system(size: RestingStyle.compactTimerFontSize, weight: .semibold))
          .foregroundStyle(RestingStyle.mint)
          .multilineTextAlignment(.trailing)
          .frame(width: RestingStyle.compactTimerWidth, alignment: .trailing)
          .lineLimit(1)
      } minimal: {
        Image(systemName: RestingStyle.symbol)
          .foregroundStyle(RestingStyle.mint)
          .accessibilityLabel(Text(attributes.dogName + ", " + attributes.lyingLabel))
      }
      .widgetURL(attributes.url)
      .keylineTint(RestingStyle.mint)
    }
  }
}
