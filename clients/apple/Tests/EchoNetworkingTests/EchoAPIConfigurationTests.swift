import EchoNetworking
import Foundation
import Testing

@Suite struct EchoAPIConfigurationTests {
  @Test func allowsHttpsAndLoopbackHttpOnly() {
    #expect(
      EchoAPIConfiguration.isAllowedAPIBaseURL(URL(string: "https://chat-echo.com")!))
    #expect(
      EchoAPIConfiguration.isAllowedAPIBaseURL(URL(string: "http://localhost:3000")!))
    #expect(
      EchoAPIConfiguration.isAllowedAPIBaseURL(URL(string: "http://127.0.0.1:3000")!))
    #expect(
      !EchoAPIConfiguration.isAllowedAPIBaseURL(URL(string: "http://192.168.1.10:3000")!))
    #expect(!EchoAPIConfiguration.isAllowedAPIBaseURL(URL(string: "ftp://chat-echo.com")!))
  }

  @Test func recognizesLoopbackHosts() {
    #expect(EchoAPIConfiguration.isLoopbackAPIBaseURL(URL(string: "http://localhost:3000")!))
    #expect(EchoAPIConfiguration.isLoopbackAPIBaseURL(URL(string: "http://127.0.0.1:3000")!))
    #expect(!EchoAPIConfiguration.isLoopbackAPIBaseURL(URL(string: "https://chat-echo.com")!))
  }
}
