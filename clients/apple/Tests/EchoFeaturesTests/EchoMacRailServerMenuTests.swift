import EchoDomain
import Testing

@testable import EchoFeatures

#if os(macOS)
  @Suite("EchoMacRailServerSheet")
  struct EchoMacRailServerMenuTests {
    @Test func sheetIDsAreStablePerAction() {
      let server = EchoServerSummary(id: "srv", name: "Alpha")
      #expect(EchoMacRailServerSheet.invite(server).id == "invite:srv")
      #expect(EchoMacRailServerSheet.notifications(server).id == "notifications:srv")
      #expect(EchoMacRailServerSheet.settings(server).id == "settings:srv")
    }
  }
#endif
