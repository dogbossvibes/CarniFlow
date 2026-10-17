// swift-tools-version: 5.9
import PackageDescription

// Local unit-test harness only. The app continues to use Expo/CocoaPods.
let package = Package(
  name: "AnyvoMotionSensorTests",
  products: [],
  targets: [
    .target(name: "MotionSensorCore", path: "ios",
      exclude: ["AnyvoMotionManager.swift", "AnyvoMotionModule.swift", "AnyvoMotion.podspec"],
      sources: ["MotionSensorState.swift"]),
    .testTarget(name: "MotionSensorCoreTests", dependencies: ["MotionSensorCore"], path: "tests/Native"),
  ]
)
