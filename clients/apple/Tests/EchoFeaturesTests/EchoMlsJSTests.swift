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

  @Test func prepareJSONNullMeansVoiceE2eeDisabledNotHardFailure() throws {
    let fromNull = try EchoVoiceE2EEPrepareJSON.decode("null")
    #expect(fromNull.encryption == nil)
    #expect(fromNull.deviceID == nil)
    #expect(fromNull.hasMaterial == false)

    let fromNSNull = try EchoVoiceE2EEPrepareJSON.decode(NSNull())
    #expect(fromNSNull.hasMaterial == false)

    let fromEmptyKeys = try EchoVoiceE2EEPrepareJSON.decode(
      #"{"keyIndex":0,"deviceId":"dev-1","channelKey":"","senderKeys":{}}"#)
    #expect(fromEmptyKeys.encryption == nil)
    #expect(fromEmptyKeys.deviceID == "dev-1")
    #expect(fromEmptyKeys.hasMaterial == false)
  }

  @Test func prepareJSONDecodesSenderKeys() throws {
    let key = Data(repeating: 0xAB, count: 16)
    let b64 = key.base64EncodedString()
    let result = try EchoVoiceE2EEPrepareJSON.decode(
      #"{"keyIndex":3,"deviceId":"dev-2","senderKeys":{"user-a":"\#(b64)"}}"#)
    #expect(result.deviceID == "dev-2")
    #expect(result.encryption?.keyIndex == 3)
    #expect(result.encryption?.senderKeys["user-a"] == key)
    #expect(result.hasMaterial == true)
  }
}
