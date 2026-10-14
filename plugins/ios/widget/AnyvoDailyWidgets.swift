import AppIntents
import SwiftUI
import WidgetKit

private func readAnyvoWidgetEnvelope() -> AnyvoWidgetEnvelope? {
  guard let group = Bundle.main.object(forInfoDictionaryKey: "AnyvoWidgetAppGroup") as? String,
        let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
  else { return nil }
  return AnyvoDailyWidgetStore(directory: directory).read()
}

@available(iOS 17.0, *)
struct AnyvoWidgetDogEntity: AppEntity {
  let id: String
  let name: String
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "dw.dog")
  static var defaultQuery = AnyvoWidgetDogQuery()
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

@available(iOS 17.0, *)
struct AnyvoWidgetDogQuery: EntityQuery {
  private func dogs() -> [AnyvoWidgetDogEntity] {
    guard let envelope = readAnyvoWidgetEnvelope(), envelope.ownerKey != nil,
          let snapshot = envelope.snapshot, snapshot.schemaVersion == 1,
          snapshot.expiresAtMs > Date().timeIntervalSince1970 * 1000
    else { return [] }
    return snapshot.dogs.map { AnyvoWidgetDogEntity(id: $0.id, name: $0.name) }
  }
  func entities(for identifiers: [String]) async throws -> [AnyvoWidgetDogEntity] {
    dogs().filter { identifiers.contains($0.id) }
  }
  func suggestedEntities() async throws -> [AnyvoWidgetDogEntity] { dogs() }
}

@available(iOS 17.0, *)
struct AnyvoDailyWidgetIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "dw.configure"
  static var description = IntentDescription("dw.configureDescription")
  @Parameter(title: "dw.dog") var dog: AnyvoWidgetDogEntity?
}

struct AnyvoDailyWidgetEntry: TimelineEntry {
  let date: Date
  let envelope: AnyvoWidgetEnvelope?
  let dogId: String?
}

@available(iOS 17.0, *)
struct AnyvoDailyWidgetProvider: AppIntentTimelineProvider {
  typealias Intent = AnyvoDailyWidgetIntent
  typealias Entry = AnyvoDailyWidgetEntry
  func placeholder(in context: Context) -> Entry { Entry(date: Date(), envelope: nil, dogId: nil) }
  func snapshot(for configuration: Intent, in context: Context) async -> Entry {
    Entry(date: Date(), envelope: readAnyvoWidgetEnvelope(), dogId: configuration.dog?.id)
  }
  func timeline(for configuration: Intent, in context: Context) async -> Timeline<Entry> {
    let now = Date()
    let envelope = readAnyvoWidgetEnvelope()
    let nowMs = now.timeIntervalSince1970 * 1000
    var dates = [now]
    if let snapshot = envelope?.snapshot, snapshot.expiresAtMs > nowMs {
      let bounds = [snapshot.freshUntilMs, snapshot.expiresAtMs]
        + snapshot.items.flatMap { [$0.startAtMs + 1, $0.endAtMs ?? $0.startAtMs + 1] }
      dates += bounds.filter { $0 > nowMs && $0 <= snapshot.expiresAtMs }.map { Date(timeIntervalSince1970: $0 / 1000) }
      if let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now)) { dates.append(midnight) }
    }
    let uniqueDates = Array(Set(dates)).sorted().prefix(40)
    let entries = uniqueDates.map { Entry(date: $0, envelope: envelope, dogId: configuration.dog?.id) }
    // The system schedules refreshes; never promises a real-time feed or polls the backend.
    return Timeline(entries: entries, policy: .after(now.addingTimeInterval(900)))
  }
}

@available(iOS 17.0, *)
private struct AnyvoDailyWidgetView: View {
  let entry: AnyvoDailyWidgetEntry
  let appointmentsOnly: Bool
  @Environment(\.widgetFamily) private var family

  private var projection: AnyvoWidgetProjection {
    anyvoWidgetProjection(entry.envelope, at: entry.date, dogId: entry.dogId, carPlay: appointmentsOnly)
  }
  private var stateKey: LocalizedStringKey {
    switch projection.state {
    case .ready: return projection.snapshot?.truncated == true ? "dw.partial" : appointmentsOnly ? "dw.emptyAppointment" : "dw.empty"
    case .signedOut: return "dw.signedOut"
    case .noSnapshot: return "dw.noSnapshot"
    case .offline: return "dw.offline"
    case .error: return "dw.error"
    case .stale: return "dw.stale"
    case .expired: return "dw.expired"
    case .selectionUnavailable: return "dw.selectionUnavailable"
    }
  }
  private func itemLabel(_ item: AnyvoWidgetItem) -> LocalizedStringKey {
    item.status == .pending ? "dw.pending" : item.kind == .reminder ? "dw.reminder" : "dw.appointment"
  }
  private func row(_ item: AnyvoWidgetItem) -> some View {
    HStack(spacing: 8) {
      Text(Date(timeIntervalSince1970: item.startAtMs / 1000), style: .time).monospacedDigit()
      Text(itemLabel(item)).lineLimit(1)
      Spacer(minLength: 0)
      if !item.dogIds.isEmpty { Text(item.dogIds.count == 1 ? "dw.oneDog" : "dw.severalDogs").foregroundStyle(.secondary).lineLimit(1) }
    }
    .font(.caption)
    .accessibilityElement(children: .combine)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .top, spacing: 4) {
        Text(appointmentsOnly ? "dw.nextAppointment" : "dw.title")
          .font(.caption.weight(.semibold)).foregroundStyle(.secondary).lineLimit(2)
        if !appointmentsOnly && projection.pendingRequests > 0 && projection.appointment?.status == .confirmed {
          Spacer(minLength: 0)
          Text("dw.requestBadge").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            .accessibilityLabel(Text("dw.requestBadgeAccessibility"))
        }
      }
      if let item = projection.appointment {
        if family == .systemSmall {
          Text(Date(timeIntervalSince1970: item.startAtMs / 1000), style: .time)
            .font(.largeTitle.weight(.semibold)).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
          Text(Date(timeIntervalSince1970: item.startAtMs / 1000), style: .date)
            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
          if !appointmentsOnly {
            HStack(spacing: 4) {
              Text(itemLabel(item))
              if !item.dogIds.isEmpty {
                Text(item.dogIds.count == 1 ? "dw.oneDog" : "dw.severalDogs").foregroundStyle(.secondary)
              }
            }.font(.caption).lineLimit(1).minimumScaleFactor(0.8)
          }
        } else {
          HStack(spacing: 8) {
            Text(Date(timeIntervalSince1970: item.startAtMs / 1000), style: .date).foregroundStyle(.secondary)
            row(item)
          }.font(.caption)
        }
      }
      if !appointmentsOnly {
        ForEach(Array(projection.reminders.prefix(family == .systemSmall ? 1 : 2)), id: \.id) { row($0) }
        if projection.reminders.count > (family == .systemSmall ? 1 : 2) {
          Text("+\(projection.reminders.count - (family == .systemSmall ? 1 : 2))").font(.caption).foregroundStyle(.secondary)
        }
      }
      if projection.appointment == nil && projection.reminders.isEmpty { Text(stateKey).font(.callout).lineLimit(3) }
      Spacer(minLength: 0)
      if let snapshot = projection.snapshot, projection.state != .ready || snapshot.truncated {
        if projection.appointment != nil || !projection.reminders.isEmpty { Text(stateKey).font(.caption2).lineLimit(1) }
        HStack(spacing: 4) {
          Text("dw.asOf")
          Text(Date(timeIntervalSince1970: snapshot.generatedAtMs / 1000), style: .date)
          Text(Date(timeIntervalSince1970: snapshot.generatedAtMs / 1000), style: .time).monospacedDigit()
        }.font(.caption2).foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(.fill.tertiary, for: .widget)
    .accessibilityElement(children: .contain)
  }
}

@available(iOS 17.0, *)
struct AnyvoDailyWidget: Widget {
  let kind = "AnyvoDaily"
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: AnyvoDailyWidgetIntent.self, provider: AnyvoDailyWidgetProvider()) { entry in
      AnyvoDailyWidgetView(entry: entry, appointmentsOnly: false)
        .privacySensitive()
        .widgetURL(URL(string: "anyvo://widgets/today"))
    }
    .configurationDisplayName("dw.title")
    .description("dw.description")
    .supportedFamilies([.systemSmall, .systemMedium])
    .anyvoPhoneOnly()
  }
}

@available(iOS 17.0, *)
struct AnyvoAppointmentsWidget: Widget {
  let kind = "AnyvoAppointments"
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: AnyvoDailyWidgetIntent.self, provider: AnyvoDailyWidgetProvider()) { entry in
      // Separate conservative projection. No names, titles, health-linked
      // appointments, tasks, links, buttons or app-launch primary action in a car.
      AnyvoDailyWidgetView(entry: entry, appointmentsOnly: true)
    }
    .configurationDisplayName("dw.carPlayTitle")
    .description("dw.carPlayDescription")
    .supportedFamilies([.systemSmall])
    .containerBackgroundRemovable(true)
  }
}
