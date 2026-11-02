import EchoDomain
import Foundation
import Testing

@testable import EchoNetworking

/// Message requests, image slots, and invite previews on the wire.
@Suite("Final parity blockers wire")
struct EchoFinalParityBlockersWireTests {
  @Test func decodesMessageRequestsAndAcceptance() throws {
    let list = try JSONDecoder().decode(
      [String: [EchoMessageRequest]].self,
      from: Data(
        #"{"requests":[{"id":"c1","channelId":"c1","fromUserId":"u9","preview":"hey"}]}"#.utf8))
    let request = try #require(list["requests"]?.first)
    #expect(request.id == "c1" && request.fromUserID == "u9" && request.preview == "hey")
    #expect(request.conversation.peerUserID == "u9" && request.conversation.channelID == "c1")
    let accepted = try JSONDecoder().decode(
      EchoMessageRequestAcceptance.self, from: Data(#"{"channelId":"c1","peerUserId":"u9"}"#.utf8))
    #expect(accepted.channelID == "c1" && accepted.peerUserID == "u9")
  }

  private func imageSlotMessage(url: String?) -> String {
    let image = url.map { #","imageUrl":"\#($0)""# } ?? ""
    return #"""
      { "id": "m1", "authorId": "u1", "timestamp": "2026-01-01T00:00:00Z",
        "content": "Look\n![image: ratio=16:9, slotId=s1]",
        "contentJson": { "type": "doc", "content": [
          { "type": "paragraph" },
          { "type": "imageSlot", "attrs": { "slotId": "s1", "aspectW": 16, "aspectH": 9\#(image) } } ] } }
      """#
  }

  @Test func imageSlotsRenderEmptyAndFilledAndStripToken() throws {
    for (url, filled) in [(nil, false), ("https://cdn/x.png", true)] as [(String?, Bool)] {
      let payload = try JSONDecoder().decode(
        EchoWireMessagePayload.self, from: Data(imageSlotMessage(url: url).utf8))
      let message = try #require(payload.message(channelID: "c1", currentUserID: "u1"))
      let slot = try #require(message.components?.imageSlots.first)
      #expect(slot.slotID == "s1" && slot.aspectW == 16 && slot.aspectH == 9)
      #expect(slot.isFilled == filled && slot.imageURL == url)
      #expect(message.content == "Look")
    }
  }

  @Test func messageUpdatedCarriesFilledSlot() throws {
    let json = #"""
      { "channelId": "c1", "messageId": "m1", "content": "Look\n![image: ratio=4:3, slotId=s2]",
        "editedAt": "2026-01-01T00:00:00Z",
        "contentJson": { "type": "doc", "content": [
          { "type": "imageSlot", "attrs": { "slotId": "s2", "aspectW": 4, "aspectH": 3,
            "imageUrl": "https://cdn/y.png" } } ] } }
      """#
    let event = EchoRealtimeEventDecoder.event(
      name: "message:updated", json: Data(json.utf8), currentUserID: "u1")
    guard case .messageUpdated(_, _, let content, _, _, let slots)? = event else {
      Issue.record("expected messageUpdated")
      return
    }
    #expect(content == "Look")
    #expect(slots?.first?.imageURL == "https://cdn/y.png")
    let original = try JSONDecoder().decode(
      EchoWireMessagePayload.self, from: Data(imageSlotMessage(url: nil).utf8))
    let empty = try #require(original.message(channelID: "c1", currentUserID: "u1"))
    #expect(empty.components?.imageSlots.first?.isFilled == false)
    let updated = empty.replacingEditedContent(content, editedAt: nil, imageSlots: slots)
    #expect(updated.components?.imageSlots.first?.isFilled == true)
  }

  @Test func decodesInvitePreview() throws {
    let preview = try JSONDecoder().decode(
      EchoInvitePreview.self,
      from: Data(
        #"{"name":" Echo HQ ","memberCount":12,"serverId":"s1","voiceChannel":{"id":"v1","name":"Lounge"}}"#
          .utf8))
    #expect(preview.name == "Echo HQ" && preview.memberCount == 12)
    #expect(preview.isVoiceInvite && preview.voiceChannelName == "Lounge")
  }
}
