import Foundation
import Testing

@testable import EchoDomain

struct EchoComposerDocBuilderTests {
  private func mention(
    _ kind: String, _ label: String, start: Int, userID: String? = nil, roleID: String? = nil,
    channelID: String? = nil
  ) -> EchoMessageMention {
    EchoMessageMention(
      id: UUID().uuidString, kind: kind, label: label, start: start,
      end: start + label.utf16.count + 1, userID: userID, channelID: channelID, roleID: roleID)
  }

  @Test func plainTextWithMentionsStaysV1AndKeepsMentions() throws {
    let ada = mention("user", "Ada", start: 3, userID: "u1")
    let built = EchoComposerDocBuilder.build(text: "hi @Ada!", mentions: [ada])
    #expect(built.contentJSON == nil)
    #expect(built.mentions.map(\.userID) == ["u1"])
    #expect(built.content == "hi @Ada!")
  }

  @Test func normalizeDropsInvalidOverlappingAndUnidentifiedMentions() {
    let text = "@Everyone @Ada #general"
    let ok = mention("everyone", "Everyone", start: 0)
    let overlap = EchoMessageMention(
      id: "o", kind: "user", label: "x", start: 4, end: 8, userID: "u")
    let noUser = mention("user", "Ada", start: 10)
    let channel = mention("channel", "general", start: 15, channelID: "c1")
    let outOfRange = EchoMessageMention(
      id: "r", kind: "role", label: "r", start: 20, end: 99, roleID: "r1")
    let out = EchoComposerDocBuilder.normalize([channel, noUser, overlap, outOfRange, ok], in: text)
    #expect(out.map(\.kind) == ["everyone", "channel"])
  }

  @Test func imageSlotShortcutBuildsV2DocWithMentionNodes() throws {
    let ada = mention("user", "Ada", start: 0, userID: "u1")
    let text = "@Ada look\n![image: ratio=4:3]\nbye"
    let built = EchoComposerDocBuilder.build(text: text, mentions: [ada])
    let doc = try #require(built.contentJSON)
    let data = try JSONEncoder().encode(doc)
    let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let blocks = try #require(root["content"] as? [[String: Any]])
    #expect(blocks.map { $0["type"] as? String } == ["paragraph", "imageSlot", "paragraph"])
    let attrs = try #require(blocks[1]["attrs"] as? [String: Any])
    #expect(attrs["aspectW"] as? Int == 4 && attrs["aspectH"] as? Int == 3)
    #expect((attrs["slotId"] as? String)?.isEmpty == false)
    let first = try #require((blocks[0]["content"] as? [[String: Any]]))
    #expect(first.first?["type"] as? String == "mentionEntity")
    #expect((first.first?["attrs"] as? [String: Any])?["userId"] as? String == "u1")
  }

  @Test func unsupportedRatioIsNotABlock() {
    let built = EchoComposerDocBuilder.build(text: "![image: ratio=5:4]", mentions: [])
    #expect(built.contentJSON == nil)
  }

  @Test func buttonShortcutsRoundTripThroughFormatAndBuild() throws {
    let buttons = [
      EchoComposerButton(label: "Confirm", style: 1, customID: "confirm"),
      EchoComposerButton(label: "Docs", style: 5, url: "https://example.com/a b"),
    ]
    let token = EchoComposerRichBlocks.buttonRowShortcut(buttons)
    #expect(token.hasPrefix("![buttonrow:"))
    let built = EchoComposerDocBuilder.build(text: "Pick\n" + token, mentions: [])
    let data = try JSONEncoder().encode(try #require(built.contentJSON))
    let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let blocks = try #require(root["content"] as? [[String: Any]])
    let row = try #require(blocks.last?["attrs"] as? [String: Any])
    let encoded = try #require(row["buttons"] as? [[String: Any]])
    #expect(encoded.count == 2)
    #expect(encoded[0]["customId"] as? String == "confirm")
    #expect(encoded[1]["style"] as? Int == 5)
  }

  @Test func singleButtonShortcutsMatchWebTokens() {
    let link = EchoComposerRichBlocks.buttonRowShortcut([
      EchoComposerButton(label: "Link", style: 5, url: "https://example.com")
    ])
    #expect(link == "![button: label=Link, url=https://example.com]")
    let action = EchoComposerRichBlocks.buttonRowShortcut([
      EchoComposerButton(label: "Button", style: 2, customID: "action")
    ])
    #expect(action == "![button: label=Button, style=secondary, id=action]")
    #expect(EchoComposerRichBlocks.imageSlotShortcut(w: 16, h: 9) == "![image: ratio=16:9]")
  }
}
