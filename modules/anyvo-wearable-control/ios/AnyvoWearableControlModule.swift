import ExpoModulesCore
import WatchConnectivity

public final class AnyvoWearableControlModule: Module {
  private lazy var transport = AnyvoWatchPhoneTransport()
  public func definition() -> ModuleDefinition {
    Name("AnyvoWearableControl")
    Events("onCommand", "onConnection")
    OnCreate {
      self.transport.onCommand = { [weak self] payload in self?.sendEvent("onCommand", payload) }
      self.transport.onConnection = { [weak self] connected in self?.sendEvent("onConnection", ["connected": connected]) }
    }
    OnStartObserving { self.transport.start() }
    OnStopObserving { self.transport.stop() }
    Function("isAvailable") { WCSession.isSupported() }
    AsyncFunction("publishSnapshot") { (json: String) -> Bool in try self.transport.publish(json) }.runOnQueue(.main)
    AsyncFunction("respond") { (requestId: String, json: String) -> Bool in
      try self.transport.respond(requestId: requestId, json: json)
    }.runOnQueue(.main)
    AsyncFunction("clear") { self.transport.clear() }.runOnQueue(.main)
    OnDestroy { self.transport.stop() }
  }
}
