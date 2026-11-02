import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoChannelIconTests {
  @Test func voiceUsesVolumeIconWhenCustomKeyFails() {
    let channel = EchoGuildChannel(
      id: "vc-1",
      name: "General",
      type: "voice",
      iconKey: "not-a-real-icon-key")
    let resolved = EchoChannelIconResolver.resolve(
      channel: channel, customEmojiURL: nil, baseURL: URL(string: "https://chat-echo.com")!)
    switch resolved {
    case .asset(let name):
      #expect(name == "EchoChannelVolume")
    case .catalog(let name):
      #expect(name.lowercased().contains("volume") || name.lowercased().contains("speaker"))
    case .system(let name):
      #expect(name.contains("speaker") || name.contains("waveform"))
    default:
      Issue.record("expected voice type default, got \(resolved)")
    }
  }

  @Test func rulesChannelUsesListIcon() {
    let channel = EchoGuildChannel(id: "tx-1", name: "rules", type: "text")
    let resolved = EchoChannelIconResolver.resolve(
      channel: channel, customEmojiURL: nil, baseURL: URL(string: "https://chat-echo.com")!)
    switch resolved {
    case .catalog(let name):
      #expect(name.lowercased().contains("list"))
    case .system(let name):
      #expect(name.contains("list"))
    default:
      Issue.record("expected rules list icon, got \(resolved)")
    }
  }

  @Test func stageUsesSofaWhenKeyMissing() {
    let channel = EchoGuildChannel(id: "st-1", name: "Town hall", type: "stage")
    let resolved = EchoChannelIconResolver.resolve(
      channel: channel, customEmojiURL: nil, baseURL: URL(string: "https://chat-echo.com")!)
    switch resolved {
    case .catalog(let name):
      #expect(name.lowercased().contains("sofa"))
    case .asset(let name):
      #expect(name == "EchoChannelSofa")
    default:
      Issue.record("expected stage type default, got \(resolved)")
    }
  }
}
