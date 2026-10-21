import XCTest
@testable import MotionSensorCore

final class PedometerDeliveryTests: XCTestCase {
  private func motion(_ s: inout MotionSensorState, _ token: UInt64, at: Double) {
    s.recordMotion(token: token, at: at, receivedAt: at, acceleration: 0.1,
                   rotation: 0.2, yawDegrees: 0)
  }
  private func steps(_ s: inout MotionSensorState, _ token: UInt64, total: Int, at: Double) {
    s.recordPedometer(token: token, total: total, endAt: at, receivedAt: at, cadencePerMinute: 90)
  }
  private func emit(_ s: inout MotionSensorState, _ token: UInt64, at: Double) -> [String: Any]? {
    s.emit(token: token, now: at, unixMs: 100_000)
  }

  func testEmptyTicksRetainFreshStepsUntilOneRealMotionPayloadConsumesThem() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    steps(&s, t, total: 2, at: 10.1)
    XCTAssertNil(emit(&s, t, at: 10.25)); XCTAssertNil(emit(&s, t, at: 10.5))
    motion(&s, t, at: 10.6)
    let p = try XCTUnwrap(emit(&s, t, at: 10.75))
    XCTAssertEqual(p["stepDelta"] as? Int, 2)
    XCTAssertEqual(p["pedometerPublishedStepCount"] as? Int, 2)
    XCTAssertEqual(p["pedometerDiscardedStepCount"] as? Int, 0)
    XCTAssertEqual(p["discardedWindowCount"] as? Int, 2)
    motion(&s, t, at: 10.8)
    XCTAssertEqual(emit(&s, t, at: 11)?["stepDelta"] as? Int, 0)
  }

  func testStaleMotionDoesNotConsumeStillFreshPedometerData() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    motion(&s, t, at: 10.1); steps(&s, t, total: 3, at: 12.1)
    XCTAssertNil(emit(&s, t, at: 12.2))
    motion(&s, t, at: 12.3)
    XCTAssertEqual(emit(&s, t, at: 12.5)?["stepDelta"] as? Int, 3)
  }

  func testEachPendingBatchExpiresWithoutBeingRefreshedByLaterCumulativeUpdates() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    steps(&s, t, total: 2, at: 10.1)
    XCTAssertNil(emit(&s, t, at: 10.25))
    steps(&s, t, total: 3, at: 12)
    motion(&s, t, at: 12.2)
    let p = try XCTUnwrap(emit(&s, t, at: 12.25))
    XCTAssertEqual(p["stepDelta"] as? Int, 1)
    XCTAssertEqual(p["pedometerCumulativeSteps"] as? Int, 3)
    XCTAssertEqual(p["pedometerPublishedStepCount"] as? Int, 1)
    XCTAssertEqual(p["pedometerDiscardedStepCount"] as? Int, 2)
  }

  func testFreshZeroDeltaDoesNotReviveExpiredSteps() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    steps(&s, t, total: 2, at: 10.1)
    XCTAssertNil(emit(&s, t, at: 10.25))
    steps(&s, t, total: 2, at: 12.2); motion(&s, t, at: 12.3)
    let p = try XCTUnwrap(emit(&s, t, at: 12.5))
    XCTAssertEqual(p["stepDelta"] as? Int, 0)
    XCTAssertEqual(p["pedometerDiscardedStepCount"] as? Int, 2)
    XCTAssertTrue(p["pedometerStepWindowStartTimestamp"] is NSNull)
    XCTAssertTrue(p["pedometerStepWindowEndTimestamp"] is NSNull)
  }

  func testPendingFreshnessBoundaryIsInclusiveWithoutExtendingItOnEmptyTicks() {
    for (now, expected) in [(12.1, 2), (12.1001, 0)] {
      var s = MotionSensorState(); let t = s.start(at: 10)
      steps(&s, t, total: 2, at: 10.1)
      XCTAssertNil(emit(&s, t, at: 11)); motion(&s, t, at: now)
      XCTAssertEqual(emit(&s, t, at: now)?["stepDelta"] as? Int, expected)
    }
  }

  func testStepsNewerThanMotionAreNotAttributedToAnEarlierMeasurement() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    motion(&s, t, at: 10.1); steps(&s, t, total: 2, at: 10.2)
    let p = try XCTUnwrap(emit(&s, t, at: 10.25))
    XCTAssertEqual(p["stepDelta"] as? Int, 0)
    XCTAssertEqual(p["pedometerPendingStepCount"] as? Int, 2)
    motion(&s, t, at: 10.3)
    XCTAssertEqual(emit(&s, t, at: 10.5)?["stepDelta"] as? Int, 2)
  }

  func testStepCoverageIsSeparateFromMotionWindowAndHasNoInventedPerStepTimes() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    steps(&s, t, total: 2, at: 10.1); XCTAssertNil(emit(&s, t, at: 10.25))
    steps(&s, t, total: 3, at: 10.3); motion(&s, t, at: 10.4)
    let p = try XCTUnwrap(emit(&s, t, at: 10.5))
    XCTAssertEqual(p["stepDelta"] as? Int, 3)
    XCTAssertEqual(p["pedometerStepWindowStartTimestamp"] as? Double ?? 0, 99_500, accuracy: 0.001)
    XCTAssertEqual(p["pedometerStepWindowEndTimestamp"] as? Double ?? 0, 99_800, accuracy: 0.001)
    XCTAssertEqual(p["windowStartTimestamp"] as? Double ?? 0, 99_900, accuracy: 0.001)
    XCTAssertTrue(JSONSerialization.isValidJSONObject(p))
  }

  func testErrorAndNewRunNeverCarryPendingStepsAcrossTheirBoundary() throws {
    var s = MotionSensorState(); let old = s.start(at: 10)
    steps(&s, old, total: 2, at: 10.1); XCTAssertNil(emit(&s, old, at: 10.25))
    s.invalidatePedometer(token: old); motion(&s, old, at: 10.4)
    let p = try XCTUnwrap(emit(&s, old, at: 10.5))
    XCTAssertEqual(p["stepDelta"] as? Int, 0)
    XCTAssertEqual(p["pedometerDiscardedStepCount"] as? Int, 2)
    steps(&s, old, total: 3, at: 10.6); s.stop()
    let t = s.start(at: 20)
    steps(&s, old, total: 99, at: 20.1); motion(&s, t, at: 20.2)
    let next = try XCTUnwrap(emit(&s, t, at: 20.25))
    XCTAssertEqual(next["stepDelta"] as? Int, 0)
    XCTAssertEqual(next["pedometerCumulativeSteps"] as? Int, 0)
    XCTAssertEqual(next["pedometerPublishedStepCount"] as? Int, 0)
    XCTAssertEqual(next["pedometerDiscardedStepCount"] as? Int, 0)
  }

  func testPedometerErrorPreservesOrderingBaselineAndDoesNotReplayDiscardedTotals() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    steps(&s, t, total: 2, at: 10.2); s.invalidatePedometer(token: t)
    // The source timestamp predates the last accepted update despite a newer receipt.
    s.recordPedometer(token: t, total: 99, endAt: 10.1, receivedAt: 10.3, cadencePerMinute: 90)
    motion(&s, t, at: 10.4)
    let invalid = try XCTUnwrap(emit(&s, t, at: 10.5))
    XCTAssertEqual(invalid["pedometerCumulativeSteps"] as? Int, 2)
    XCTAssertTrue(invalid["pedometerAgeMs"] is NSNull)
    steps(&s, t, total: 3, at: 10.6); motion(&s, t, at: 10.7)
    let recovered = try XCTUnwrap(emit(&s, t, at: 10.75))
    XCTAssertEqual(recovered["stepDelta"] as? Int, 1)
    XCTAssertEqual(recovered["pedometerCumulativeSteps"] as? Int, 3)
    XCTAssertEqual(recovered["pedometerDiscardedStepCount"] as? Int, 2)
    XCTAssertEqual(recovered["pedometerStepWindowStartTimestamp"] as? Double ?? 0, 99_450, accuracy: 0.001)
  }
}
