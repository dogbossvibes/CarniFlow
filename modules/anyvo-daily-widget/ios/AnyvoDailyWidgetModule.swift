import CryptoKit
import Foundation
import ExpoModulesCore
import WidgetKit

public class AnyvoDailyWidgetModule: Module {
  private lazy var store: AnyvoDailyWidgetStore? = {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "AnyvoWidgetAppGroup") as? String,
          let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return AnyvoDailyWidgetStore(directory: url)
  }()

  private func reload() {
    WidgetCenter.shared.reloadTimelines(ofKind: "AnyvoDaily")
    WidgetCenter.shared.reloadTimelines(ofKind: "AnyvoAppointments")
  }
  public func definition() -> ModuleDefinition {
    Name("AnyvoDailyWidget")
    Function("isAvailable") { self.store != nil }
    Function("beginSession") { (ownerId: String?) -> String in
      guard let store = self.store else { throw AnyvoWidgetStoreError.unavailable }
      let key = ownerId.flatMap { $0.isEmpty ? nil : SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined() }
      defer { self.reload() }
      return try store.beginSession(ownerKey: key)
    }
    AsyncFunction("updateSnapshot") { (token: String, sequence: Int, json: String) -> Bool in
      guard let store = self.store else { return false }
      let updated = try store.updateSnapshot(token: token, sequence: sequence, json: json)
      if updated { self.reload() }
      return updated
    }
    AsyncFunction("updateAvailability") { (token: String, sequence: Int, state: String) -> Bool in
      guard let store = self.store, let state = AnyvoWidgetAvailability(rawValue: state) else { return false }
      let updated = try store.updateAvailability(token: token, sequence: sequence, state: state)
      if updated { self.reload() }
      return updated
    }
  }
}
