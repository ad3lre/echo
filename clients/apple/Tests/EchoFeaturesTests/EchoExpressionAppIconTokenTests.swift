import Testing

@testable import EchoFeatures

@Suite("Expression picker app icon tokens")
struct EchoExpressionAppIconTokenTests {
  @Test func buildsWebStyleIconToken() {
    #expect(EchoExpressionPicker.appIconToken("Voice Chat.svg") == "<icon:Voice Chat.svg>")
    #expect(EchoExpressionPicker.appIconToken("<bad>.svg") == "<icon:bad.svg>")
    #expect(EchoExpressionPicker.appIconToken("   ") == "<icon:icon.svg>")
  }
}
