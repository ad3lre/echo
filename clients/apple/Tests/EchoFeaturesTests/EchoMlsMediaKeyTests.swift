import Foundation
import Testing

@testable import EchoFeatures

struct EchoMlsMediaKeyTests {
  @Test func matchesTsMlsExporterVectors() throws {
    let exporter = Data(repeating: 0x42, count: 32)
    let shared = try EchoMlsMediaKey.deriveShared(exporterSecret: exporter)
    let sender = try EchoMlsMediaKey.deriveSender(
      exporterSecret: exporter, senderUserID: "user-a")

    #expect(shared.hexString == "0a1bf789230568d1c200ab58a69ac35e")
    #expect(sender.hexString == "c7de4f8fcf53b9a1650041ba119684c2")
  }
}

private extension Data {
  var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
