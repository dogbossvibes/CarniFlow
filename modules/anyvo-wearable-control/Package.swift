// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "AnyvoWearableControlContract",
  products: [],
  targets: [
    .target(name: "WatchSessionCore", path: "ios/Core"),
    .testTarget(name: "WatchSessionCoreTests", dependencies: ["WatchSessionCore"], path: "tests", exclude: ["Host"], resources: [.copy("Native/Fixtures")])
  ]
)
