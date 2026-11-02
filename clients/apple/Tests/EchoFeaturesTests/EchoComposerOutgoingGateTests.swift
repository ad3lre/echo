import EchoDomain
import Testing

@testable import EchoFeatures

@Suite("Composer outgoing gate")
struct EchoComposerOutgoingGateTests {
  @Test func blocksMassMentionWithoutPermission() {
    let code = EchoComposerOutgoingGate.blockReason(
      canSendMessages: true,
      canCreatePolls: true,
      canUploadFiles: true,
      canUseExternalEmoji: true,
      canMentionEveryone: false,
      contentTypes: [.text, .massMention])
    #expect(code == .mentionEveryone)
    #expect(
      EchoComposerOutgoingGate.message(for: .mentionEveryone)
        == "You cannot mention @everyone or @active in this channel.")
  }

  @Test func blocksCustomEmojiWithoutPermission() {
    let code = EchoComposerOutgoingGate.blockReason(
      canSendMessages: true,
      canCreatePolls: true,
      canUploadFiles: true,
      canUseExternalEmoji: false,
      canMentionEveryone: true,
      contentTypes: [.text, .externalEmoji])
    #expect(code == .useExternalEmoji)
  }

  @Test func blocksMediaAndPolls() {
    #expect(
      EchoComposerOutgoingGate.blockReason(
        canSendMessages: true, canCreatePolls: false, canUploadFiles: true,
        canUseExternalEmoji: true, canMentionEveryone: true, contentTypes: [.poll])
        == .createPolls)
    #expect(
      EchoComposerOutgoingGate.blockReason(
        canSendMessages: true, canCreatePolls: true, canUploadFiles: false,
        canUseExternalEmoji: true, canMentionEveryone: true, contentTypes: [.media])
        == .sendMedia)
  }

  @Test func detectsCustomEmojiTokens() {
    #expect(EchoComposerOutgoingGate.containsCustomEmojiToken("hi <:wave:123>"))
    #expect(EchoComposerOutgoingGate.containsCustomEmojiToken("hi :party: there"))
    #expect(!EchoComposerOutgoingGate.containsCustomEmojiToken("hi :)"))
  }

  @Test func contentTypesFromMentionsAndMedia() {
    let mentions = [
      EchoMessageMention(id: "e", kind: "everyone", label: "everyone", start: 0, end: 9)
    ]
    let types = EchoComposerOutgoingGate.contentTypes(
      text: "hello", mentions: mentions, hasMedia: true, hasPoll: false)
    #expect(types.contains(.massMention))
    #expect(types.contains(.media))
  }
}
