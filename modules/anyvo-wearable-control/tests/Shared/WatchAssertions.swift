import Foundation

struct WatchCheckFailure: Error, CustomStringConvertible {
  let description: String
}
func expectTrue(_ condition: Bool, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  if !condition { throw WatchCheckFailure(description: "\(file):\(line): \(message)") }
}
func expectFalse(_ condition: Bool, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  try expectTrue(!condition, message, file: file, line: line)
}
func expectEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  try expectTrue(actual == expected, "\(message) expected \(expected), received \(actual)", file: file, line: line)
}
func expectNotEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  try expectTrue(actual != expected, message, file: file, line: line)
}
func expectNil<T>(_ value: T?, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  try expectTrue(value == nil, message, file: file, line: line)
}
func expectNotNil<T>(_ value: T?, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  try expectTrue(value != nil, message, file: file, line: line)
}
func requireValue<T>(_ value: T?, file: StaticString = #filePath, line: UInt = #line) throws -> T {
  guard let value else { throw WatchCheckFailure(description: "\(file):\(line): expected a value") }
  return value
}
func expectNoThrow<T>(_ expression: @autoclosure () throws -> T, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  do { _ = try expression() }
  catch { throw WatchCheckFailure(description: "\(file):\(line): \(message) unexpectedly threw \(error)") }
}
func expectThrows<T>(_ expression: @autoclosure () throws -> T, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
  do { _ = try expression() } catch { return }
  throw WatchCheckFailure(description: "\(file):\(line): \(message) should have thrown")
}
