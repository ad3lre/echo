import Foundation
import Testing

@testable import EchoFeatures

struct EchoMlsJSTests {
  @Test func stringLiteralEscapesWithoutAbortingOnTopLevelString() {
    #expect(EchoMlsJS.stringLiteral("hello") == "\"hello\"")
    #expect(EchoMlsJS.stringLiteral("a\"b") == "\"a\\\"b\"")
    #expect(EchoMlsJS.stringLiteral("line\nbreak") == "\"line\\nbreak\"")
    // JSONEncoder may escape `/` as `\/`; either form is valid JS.
    let urlLiteral = EchoMlsJS.stringLiteral("https://chat-echo.com/api/v1/echo")
    #expect(urlLiteral.hasPrefix("\""))
    #expect(urlLiteral.hasSuffix("\""))
    #expect(urlLiteral.contains("chat-echo.com"))
    #expect(!urlLiteral.contains("\n"))
  }

  @Test func objectLiteralEncodesKeychainSeed() {
    #expect(EchoMlsJS.objectLiteral([:]) == "{}")
    let encoded = EchoMlsJS.objectLiteral(["echo_mls_device_id:u1": "abc-123"])
    #expect(encoded.contains("echo_mls_device_id:u1"))
    #expect(encoded.contains("abc-123"))
  }

  @Test func echoAPIURLKeepsApiPrefixForRootAbsolutePaths() {
    let base = URL(string: "https://chat-echo.com/api/v1/echo")!
    #expect(
      EchoMlsJS.echoAPIURL(base: base, path: "/e2ee/devices/register")?.absoluteString
        == "https://chat-echo.com/api/v1/echo/e2ee/devices/register"
    )
    #expect(
      EchoMlsJS.echoAPIURL(base: base, path: "/dm/channels/x/voice/mls")?.absoluteString
        == "https://chat-echo.com/api/v1/echo/dm/channels/x/voice/mls"
    )
    #expect(
      EchoMlsJS.echoAPIURL(base: base, path: "e2ee/mls/key-packages")?.absoluteString
        == "https://chat-echo.com/api/v1/echo/e2ee/mls/key-packages"
    )
  }

  @Test func userFacingErrorStripsJsonParseStacks() {
    let raw = """
      JSON Parse error: Unrecognized token '<'
      parse@[native code]
      Gr@https://chat-echo.com/:64:91598
      """
    #expect(
      EchoMlsJS.userFacingError(raw)
        == "Couldn’t prepare encrypted call. Please try again."
    )
    #expect(EchoMlsJS.userFacingError("VOICE_E2EE_DISABLED") == "VOICE_E2EE_DISABLED")
  }
}
