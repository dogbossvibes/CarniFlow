import XCTest
@testable import WatchSessionCore
final class WatchSessionCoreTests: XCTestCase {
  func testSharedNativeContractAndLifecycleChecks() throws {
    let fixture = try XCTUnwrap(Bundle.module.url(forResource: "wire-fixtures-v1", withExtension: "json", subdirectory: "Fixtures"))
    try WatchContractChecks(fixtureURL: fixture).runAll()
  }
}
