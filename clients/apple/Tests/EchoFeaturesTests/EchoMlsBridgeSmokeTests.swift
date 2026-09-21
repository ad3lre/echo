import Foundation
import Testing

@testable import EchoFeatures

struct EchoMlsBridgeSmokeTests {
  @Test func bundlesPrepareEntryPoint() throws {
    let url = try #require(Bundle.module.url(forResource: "EchoMlsBridge", withExtension: "js"))
    let source = try String(contentsOf: url, encoding: .utf8)
    #expect(source.contains("__echoMlsPrepareDm"))
    #expect(source.count > 10_000)
  }
}
