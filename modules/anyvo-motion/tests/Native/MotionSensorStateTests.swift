import XCTest
@testable import MotionSensorCore

final class MotionSensorStateTests: XCTestCase {
  private func add(_ s: inout MotionSensorState, _ token: UInt64, at: Double,
                   received: Double? = nil, accel: Double = 0.1, rotation: Double = 0.2, yaw: Double = 0) {
    s.recordMotion(token: token, at: at, receivedAt: received ?? at,
                   acceleration: accel, rotation: rotation, yawDegrees: yaw)
  }
  private func emit(_ s: inout MotionSensorState, _ token: UInt64, at: Double = 10.25,
                    unix: Double = 100_000) -> [String: Any]? {
    s.emit(token: token, now: at, unixMs: unix)
  }

  func testNoSampleForEmptyWindowEvenWithStepsAndActivity() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 2, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 100)
    s.recordActivity(token: t, receivedAt: 10.1, state: "stationary", confidence: "high")
    XCTAssertNil(emit(&s, t)); XCTAssertEqual(s.discardedWindowCount, 1)
    add(&s, t, at: 10.3)
    // Empty device-motion ticks must not consume independent fresh steps.
    XCTAssertEqual(emit(&s, t, at: 10.5)?["stepDelta"] as? Int, 2)
  }

  func testMeasurementTimeAndWindowCoverageInsteadOfTimerTime() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 10.05, accel: 0.2, yaw: 10)
    add(&s, t, at: 10.20, accel: 0.4, yaw: 30)
    let p = try XCTUnwrap(emit(&s, t))
    XCTAssertEqual(p["timestamp"] as? Double ?? 0, 99_950, accuracy: 0.001)
    XCTAssertEqual(p["windowStartTimestamp"] as? Double ?? 0, 99_800, accuracy: 0.001)
    XCTAssertEqual(p["emittedAtTimestamp"] as? Double, 100_000)
    XCTAssertEqual(p["deviceMotionSampleCount"] as? Int, 2)
    XCTAssertEqual(p["deviceMotionAgeMs"] as? Double ?? 0, 50, accuracy: 0.001)
    XCTAssertEqual(p["accelerationMagnitude"] as? Double ?? 0, 0.3, accuracy: 0.0001)
    XCTAssertEqual(p["headingDelta"] as? Double, 20)
    XCTAssertTrue(JSONSerialization.isValidJSONObject(p))
    XCTAssertNil(emit(&s, t, at: 10.5)) // a timer tick cannot repeat the last measurement
  }

  func testStopRejectsOldCallbacksAndTimerAfterRestart() throws {
    var s = MotionSensorState(); let old = s.start(at: 10); let oldID = s.runID
    add(&s, old, at: 10.1); s.stop()
    XCTAssertNil(emit(&s, old))
    let new = s.start(at: 20)
    XCTAssertNotEqual(old, new); XCTAssertNotEqual(oldID, s.runID)
    add(&s, old, at: 20.1)
    s.recordPedometer(token: old, total: 99, endAt: 20.1, receivedAt: 20.1, cadencePerMinute: 120)
    s.recordActivity(token: old, receivedAt: 20.1, state: "running", confidence: "high")
    XCTAssertNil(emit(&s, old, at: 20.25)); XCTAssertNil(emit(&s, new, at: 20.25))
    add(&s, new, at: 20.3, accel: 0)
    let p = try XCTUnwrap(emit(&s, new, at: 20.5))
    XCTAssertEqual(p["stepDelta"] as? Int, 0)
    XCTAssertEqual(p["motionConfidence"] as? Double, 0.6)
    XCTAssertEqual(p["movementState"] as? String, "stationary")
  }

  func testStartIsIdempotentAndRetainsCurrentWindow() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 10.1)
    XCTAssertEqual(s.start(at: 11), t)
    XCTAssertEqual(emit(&s, t)?["deviceMotionSampleCount"] as? Int, 1)
  }

  func testDuplicateOutOfOrderBeforeStartAndFutureMeasurementsAreRejected() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 9); add(&s, t, at: 11, received: 10)
    add(&s, t, at: 10.1); add(&s, t, at: 10.1, yaw: 90); add(&s, t, at: 10.05, yaw: -90)
    XCTAssertEqual(emit(&s, t)?["deviceMotionSampleCount"] as? Int, 1)
  }

  func testStaleReceiptAndStaleEmissionCannotProduceStationaryEvidence() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 10.1, received: 13)
    XCTAssertNil(emit(&s, t, at: 13))
    add(&s, t, at: 13.1)
    XCTAssertNil(emit(&s, t, at: 15.2))
    add(&s, t, at: 15.3)
    XCTAssertNotNil(emit(&s, t, at: 15.5))
  }

  func testLongWindowIsDiscardedAfterQueueStall() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 10.1, yaw: 0); add(&s, t, at: 13.1, yaw: 150)
    let p = emit(&s, t, at: 13.2)
    XCTAssertEqual(p?["deviceMotionSampleCount"] as? Int, 1)
    XCTAssertEqual(p?["headingDelta"] as? Double, 0)
    XCTAssertEqual(p?["discardedWindowCount"] as? Int, 1)
  }

  func testInvalidNumbersDoNotPoisonWindowOrJson() throws {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: .nan); add(&s, t, at: 10.1, accel: .infinity)
    add(&s, t, at: 10.1, rotation: -.infinity); add(&s, t, at: 10.1, yaw: .nan)
    add(&s, t, at: 10.1, accel: -1); add(&s, t, at: 10.1)
    let p = try XCTUnwrap(emit(&s, t))
    XCTAssertEqual(p["deviceMotionSampleCount"] as? Int, 1)
    XCTAssertTrue(JSONSerialization.isValidJSONObject(p))
  }

  func testYawWrapKeepsShortestAngle() {
    for (a, b, expected) in [(179.0, -179.0, 2.0), (-179.0, 179.0, -2.0)] {
      var s = MotionSensorState(); let t = s.start(at: 10)
      add(&s, t, at: 10.05, yaw: a); add(&s, t, at: 10.2, yaw: b)
      XCTAssertEqual(emit(&s, t)?["headingDelta"] as? Double, expected)
    }
  }

  func testStepsConsumedOnceAndDuplicateOrReorderedTotalsIgnored() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 2, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 90)
    s.recordPedometer(token: t, total: 9, endAt: 10.1, receivedAt: 10.2, cadencePerMinute: 90)
    s.recordPedometer(token: t, total: 1, endAt: 10.05, receivedAt: 10.2, cadencePerMinute: 90)
    add(&s, t, at: 10.2)
    XCTAssertEqual(emit(&s, t)?["stepDelta"] as? Int, 2)
    add(&s, t, at: 10.3)
    XCTAssertEqual(emit(&s, t, at: 10.5)?["stepDelta"] as? Int, 0)
  }

  func testDelayedStepsUpdateBaselineWithoutBecomingFreshLater() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 10, endAt: 11, receivedAt: 14, cadencePerMinute: 100)
    s.recordPedometer(token: t, total: 11, endAt: 14.1, receivedAt: 14.1, cadencePerMinute: 90)
    add(&s, t, at: 14.1)
    let p = emit(&s, t, at: 14.2)
    XCTAssertEqual(p?["stepDelta"] as? Int, 1)
    XCTAssertEqual(p?["pedometerIntervalMs"] as? Double ?? 0, 3100, accuracy: 0.001)
  }

  func testStalePedometerHasNoStepsCadenceOrConfidenceBonus() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 2, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 90)
    add(&s, t, at: 13.1)
    let p = emit(&s, t, at: 13.2)
    XCTAssertEqual(p?["stepDelta"] as? Int, 0); XCTAssertTrue(p?["cadence"] is NSNull)
    XCTAssertEqual(p?["motionConfidence"] as? Double, 0.6)
  }

  func testPedometerErrorClearsEvidenceAndOldRunErrorCannotClearNewRun() {
    var s = MotionSensorState(); let old = s.start(at: 5); s.stop(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 2, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 90)
    s.invalidatePedometer(token: old); add(&s, t, at: 10.1)
    XCTAssertEqual(emit(&s, t)?["stepDelta"] as? Int, 2)
    s.invalidatePedometer(token: t); add(&s, t, at: 10.3)
    XCTAssertEqual(emit(&s, t, at: 10.5)?["motionConfidence"] as? Double, 0.6)
  }

  func testAbsentCadenceClearsOldValue() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 1, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 90)
    s.recordPedometer(token: t, total: 2, endAt: 10.2, receivedAt: 10.2, cadencePerMinute: nil)
    add(&s, t, at: 10.2)
    XCTAssertTrue(emit(&s, t)?["cadence"] is NSNull)
  }

  func testActivityExpiresUsingExistingSixSecondPolicy() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordActivity(token: t, receivedAt: 10.1, state: "stationary", confidence: "high")
    add(&s, t, at: 10.2, accel: 0.4)
    XCTAssertEqual(emit(&s, t)?["movementState"] as? String, "stationary")
    add(&s, t, at: 16.2, accel: 0.4)
    let p = emit(&s, t, at: 16.3)
    XCTAssertEqual(p?["movementState"] as? String, "running")
    XCTAssertEqual(p?["activityConfidence"] as? String, "low")
  }

  func testWallClockJumpDoesNotChangeAgeOrInventSensorMeasurements() {
    for unix in [50_000.0, 100_000.0, 3_000_000.0] {
      var s = MotionSensorState(); let t = s.start(at: 10)
      add(&s, t, at: 10.2)
      let p = emit(&s, t, unix: unix)
      XCTAssertEqual(p?["deviceMotionAgeMs"] as? Double ?? 0, 50, accuracy: 0.001)
      XCTAssertEqual(p?["timestamp"] as? Double ?? 0, unix - 50, accuracy: 0.001)
    }
  }
  func testFreshSourcesProduceFullConfidenceAndUnknownSourcesDoNot() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: 1, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 100)
    s.recordActivity(token: t, receivedAt: 10.1, state: "walking", confidence: "high")
    add(&s, t, at: 10.2)
    let p = emit(&s, t)
    XCTAssertEqual(p?["motionConfidence"] as? Double, 1)
    XCTAssertEqual(p?["movementState"] as? String, "walking")
    XCTAssertEqual(p?["cadence"] as? Double, 100)
  }

  func testFreshnessBoundaryIsInclusiveButNotExtendedByATimerTick() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    add(&s, t, at: 10)
    XCTAssertNotNil(emit(&s, t, at: 12))
    add(&s, t, at: 12.1)
    XCTAssertNil(emit(&s, t, at: 14.101))
  }

  func testFutureNegativeAndInvalidPedometerDataDoesNotCreateStepsOrCadence() {
    var s = MotionSensorState(); let t = s.start(at: 10)
    s.recordPedometer(token: t, total: -1, endAt: 10.1, receivedAt: 10.1, cadencePerMinute: 90)
    s.recordPedometer(token: t, total: 100, endAt: 11, receivedAt: 10.1, cadencePerMinute: 90)
    s.recordPedometer(token: t, total: 1, endAt: 10.2, receivedAt: 10.2, cadencePerMinute: .infinity)
    add(&s, t, at: 10.2)
    let p = emit(&s, t)
    XCTAssertEqual(p?["stepDelta"] as? Int, 1)
    XCTAssertTrue(p?["cadence"] is NSNull)
  }

}
