import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
struct EchoMentionsAndSlashTests {
  private let ada = EchoMentionOption(kind: .user, refID: "u-ada", name: "Ada", aliases: ["ada_l"])
  private let adam = EchoMentionOption(kind: .user, refID: "u-adam", name: "Adam", presence: "offline")
  private let mods = EchoMentionOption(kind: .role, refID: "r-mods", name: "Mods")
  private let general = EchoMentionOption(kind: .channel, refID: "c-1", name: "general chat")

  @Test func atTriggerFollowsWebRules() {
    #expect(EchoMentionTriggers.find(text: "hi @ad", caret: 6)?.query == "ad")
    #expect(EchoMentionTriggers.find(text: "mail@ad", caret: 7) == nil)
    #expect(EchoMentionTriggers.find(text: "@", caret: 1)?.start == 0)
    // Inside an already-picked mention the popup stays closed.
    #expect(EchoMentionTriggers.find(text: "@Ada", caret: 4, protectedRanges: [0..<4]) == nil)
    #expect(EchoMentionTriggers.find(text: "#gen", caret: 4)?.sigil == .hash)
    #expect(EchoMentionTriggers.find(text: "#", caret: 1) == nil)
  }

  @Test func suggestionsOrderSpecialsRolesThenOnlineUsers() {
    let options = [adam, ada, mods, .everyone, .active]
    let all = EchoMentionCatalog.atSuggestions(query: "", options: options, allowBroadcast: true)
    #expect(all.map(\.kind) == [.everyone, .active, .role, .user, .user])
    #expect(all.last?.name == "Adam")  // offline sorts after online
    let none = EchoMentionCatalog.atSuggestions(query: "", options: options, allowBroadcast: false)
    #expect(none.allSatisfy { !$0.isSpecial })
    let alias = EchoMentionCatalog.atSuggestions(query: "ada-l", options: options, allowBroadcast: true)
    #expect(alias.map(\.refID) == ["u-ada"])
    #expect(EchoMentionCatalog.hashSuggestions(query: "gen", options: [general, ada]).count == 1)
  }

  @Test func pickedMentionsBecomeRealSpansAndSurviveEdits() {
    let state = EchoComposerState()
    state.text = "hey @Ad"
    state.tokenCaretUTF16 = 7
    let trigger = EchoMentionTriggers.find(text: state.text, caret: 7)
    state.insertMention(ada, replacing: trigger)
    #expect(state.text == "hey @Ada ")
    state.text += "and #general-chat"
    state.insertMention(general, replacing: nil)
    let built = state.richContent().built
    #expect(built.mentions.count == 2)
    let first = built.mentions[0]
    #expect(first.kind == "user" && first.userID == "u-ada" && first.start == 4 && first.end == 8)
    #expect(built.mentions[1].channelID == "c-1")
    #expect(built.mentions[1].label == "general-chat")
    // Deleting the mention text drops it from the wire payload.
    state.text = "hey there"
    #expect(state.richContent().built.mentions.isEmpty)
  }

  @Test func mentionDoesNotMatchInsideLongerName() {
    let tokens = [EchoComposerMentionToken(option: ada)]
    #expect(EchoMentionResolver.resolve(text: "@Adam hi", tokens: tokens).isEmpty)
    #expect(EchoMentionResolver.resolve(text: "@Adam and @Ada", tokens: tokens).first?.start == 10)
  }

  @Test func slashCatalogCoversWebCommands() {
    let ctx = EchoSlashContext(mediaAllowed: true, pollAllowed: true, editing: false)
    let names = Set(EchoSlashCommands.catalog(ctx).map(\.name))
    for expected in [
      "upload", "gif", "poll", "image", "imageslot-4-3", "imageslot-1-1", "imageslot-21-9",
      "imageslot-3-2", "imageslot-2-3", "buttonrow", "buttonrow-confirm", "button-link", "bold",
      "spoiler", "codeblock", "alert-note", "math", "mathblock", "integral",
    ] {
      #expect(names.contains(expected), "missing /\(expected)")
    }
    let noMedia = EchoSlashContext(mediaAllowed: false, pollAllowed: false, editing: true)
    let restricted = Set(EchoSlashCommands.catalog(noMedia).map(\.name))
    #expect(!restricted.contains("upload") && !restricted.contains("gif") && !restricted.contains("poll"))
    #expect(EchoSlashCommands.filter(EchoSlashCommands.catalog(ctx), query: "poll").first?.name == "poll")
    #expect(EchoSlashCommands.filter(EchoSlashCommands.catalog(ctx), query: "imageslot-4").first?.name == "imageslot-4-3")
  }

  @Test func slashTriggerNeedsLineStartOrWhitespace() {
    #expect(EchoSlashCommands.trigger(text: "/po", caret: 3)?.query == "po")
    #expect(EchoSlashCommands.trigger(text: "hi /gif", caret: 7)?.start == 3)
    #expect(EchoSlashCommands.trigger(text: "https://x", caret: 9) == nil)
    #expect(EchoSlashCommands.trigger(text: "a\n/", caret: 3)?.query == "")
  }

  @Test func blocksLandOnTheirOwnLineAndFeedTheDocBuilder() {
    let state = EchoComposerState()
    state.text = "look"
    state.tokenCaretUTF16 = 4
    state.insertBlock(EchoComposerRichBlocks.imageSlotShortcut(w: 16, h: 9))
    #expect(state.text == "look\n![image: ratio=16:9]\n")
    #expect(state.richContent().built.contentJSON != nil)
  }

  @Test func slowmodeNeverLocksBypassersOrEdits() {
    #expect(EchoSlowmode.effectiveInterval(30, canBypass: true, isEditing: false) == 0)
    #expect(EchoSlowmode.effectiveInterval(30, canBypass: false, isEditing: true) == 0)
    #expect(EchoSlowmode.effectiveInterval(30, canBypass: false, isEditing: false) == 30)
    let sent = Date(timeIntervalSince1970: 1000)
    let rejected = Date(timeIntervalSince1970: 1010)
    #expect(EchoSlowmode.clockStart(lastSentAt: sent, serverRejectedAt: rejected) == rejected)
    #expect(EchoSlowmode.clockStart(lastSentAt: nil, serverRejectedAt: nil) == nil)
  }
}
