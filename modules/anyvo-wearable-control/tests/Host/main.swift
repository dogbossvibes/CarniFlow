import Foundation

do {
  guard CommandLine.arguments.count == 2 else { throw WatchWireError.invalid }
  let fixture = URL(fileURLWithPath: CommandLine.arguments[1])
  try WatchContractChecks(fixtureURL: fixture).runAll()
  print("PASS all native watch contract scenarios (host Foundation; not WatchConnectivity/device QA)")
} catch {
  fputs("FAIL \(error)\n", stderr)
  exit(1)
}
