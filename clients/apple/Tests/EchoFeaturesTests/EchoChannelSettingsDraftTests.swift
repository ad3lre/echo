import EchoDomain
import Testing

@testable import EchoFeatures

@Suite("EchoChannelSettingsDraft")
struct EchoChannelSettingsDraftTests {
  private func textChannel(categoryID: String = "cat-a") -> EchoGuildChannel {
    EchoGuildChannel(
      id: "c1", name: "general", type: "text", categoryID: categoryID,
      slowmodeSeconds: 5, autoDeleteSyncedToCategory: true)
  }

  private func voiceChannel() -> EchoGuildChannel {
    EchoGuildChannel(
      id: "v1", name: "lounge", type: "voice", categoryID: "cat-a",
      userLimit: 4, bitrateBps: 64_000)
  }

  @Test func unchangedDraftProducesEmptyPatch() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    #expect(initial.patch(against: initial).isEmpty)
  }

  @Test func onlyChangedFieldsAreSent() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    var next = initial
    next.name = "  lobby  "
    next.nsfw = true
    next.slowmodeSeconds = 30
    let patch = next.patch(against: initial)
    #expect(patch.name == "lobby")
    #expect(patch.nsfw == true)
    #expect(patch.slowmodeSeconds == 30)
    #expect(patch.category == nil)
    #expect(patch.userLimit == nil)
  }

  @Test func leavingCategoryRequiresKeepMode() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    var next = initial
    next.categoryID = ""
    next.moveMode = "sync"
    let patch = next.patch(against: initial)
    #expect(patch.category == .clear)
    #expect(patch.moveOutOfCategoryPermission == "keep")
  }

  @Test func movingBetweenCategoriesHonorsMoveMode() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    var next = initial
    next.categoryID = "cat-b"
    next.moveMode = "sync"
    let patch = next.patch(against: initial)
    #expect(patch.category == .set("cat-b"))
    #expect(patch.moveOutOfCategoryPermission == "sync")
  }

  @Test func joiningFirstCategorySendsNoMoveMode() {
    let initial = EchoChannelSettingsDraft(channel: textChannel(categoryID: ""))
    var next = initial
    next.categoryID = "cat-b"
    let patch = next.patch(against: initial)
    #expect(patch.category == .set("cat-b"))
    #expect(patch.moveOutOfCategoryPermission == nil)
  }

  @Test func voiceFieldsSkipTextOnlyOptions() {
    let initial = EchoChannelSettingsDraft(channel: voiceChannel())
    var next = initial
    next.userLimit = 8
    next.useDefaultBitrate = true
    next.slowmodeSeconds = 60
    next.formatTemplate = "- "
    let patch = next.patch(against: initial)
    #expect(patch.userLimit == 8)
    #expect(patch.bitrateBps == .clear)
    #expect(patch.slowmodeSeconds == nil)
    #expect(patch.messageFormatTemplate == nil)
  }

  @Test func bitrateConvertsKbpsToBps() {
    let initial = EchoChannelSettingsDraft(channel: voiceChannel())
    var next = initial
    next.bitrateKbps = 96
    #expect(next.patch(against: initial).bitrateBps == .set(96_000))
  }

  @Test func hardFormatRequiresTemplate() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    var next = initial
    next.formatHard = true
    #expect(next.patch(against: initial).isEmpty)
    next.formatTemplate = "- "
    let patch = next.patch(against: initial)
    #expect(patch.messageFormatTemplate == "- ")
    #expect(patch.messageFormatHard == true)
  }

  @Test func autoDeleteRetentionOnlySentWhenNotSynced() {
    let initial = EchoChannelSettingsDraft(channel: textChannel())
    var next = initial
    next.autoDeleteSeconds = 86_400
    #expect(next.patch(against: initial).autoDeleteAfterSeconds == nil)
    next.autoDeleteSynced = false
    let patch = next.patch(against: initial)
    #expect(patch.autoDeleteSyncedToCategory == false)
    #expect(patch.autoDeleteAfterSeconds == .set(86_400))
    next.autoDeleteSeconds = 0
    #expect(next.patch(against: initial).autoDeleteAfterSeconds == .clear)
  }
}

@Suite("EchoPermissionOverwriteRows")
struct EchoPermissionOverwriteRowsTests {
  @Test func canonicalDropsEmptyRowsAndEveryoneTarget() {
    let rows = [
      EchoPermissionOverwrite(id: "1", targetType: "members", targetID: "stale", partial: ["VIEW_CHANNEL": false]),
      EchoPermissionOverwrite(id: "2", targetType: "role", targetID: "r1", partial: [:]),
    ]
    let canonical = EchoPermissionOverwriteRows.canonical(rows)
    #expect(canonical.count == 1)
    #expect(canonical.first?.targetID == nil)
  }

  @Test func changedIgnoresRowIDsAndOrdering() {
    let a = [
      EchoPermissionOverwrite(id: "x", targetType: "role", targetID: "r1", partial: ["CONNECT": true]),
      EchoPermissionOverwrite(id: "y", targetType: "member", targetID: "u1", partial: ["SPEAK": false]),
    ]
    let b = [a[1], EchoPermissionOverwrite(id: "z", targetType: "role", targetID: "r1", partial: ["CONNECT": true])]
    #expect(!EchoPermissionOverwriteRows.changed(a, b))
    var c = b
    c[0].partial["SPEAK"] = nil
    #expect(EchoPermissionOverwriteRows.changed(a, c))
  }

  @Test func addingThenClearingAnEmptyRowIsNotAChange() {
    let base = [EchoPermissionOverwrite(id: "1", targetType: "role", targetID: "r1", partial: ["CONNECT": true])]
    let withEmpty = base + [EchoPermissionOverwrite(id: "2", targetType: "member", targetID: "u1")]
    #expect(!EchoPermissionOverwriteRows.changed(base, withEmpty))
  }
}

@Suite("EchoChannelPermissionCatalog")
struct EchoChannelPermissionCatalogTests {
  @Test func voiceDefsExcludeTextMessagingAndIncludeVoice() {
    let keys = Set(EchoChannelPermissionCatalog.defs(forChannelType: "voice").map(\.key))
    #expect(keys.contains("CONNECT"))
    #expect(keys.contains("MOVE_MEMBERS"))
    #expect(!keys.contains("SEND_MESSAGES"))
  }

  @Test func textDefsExcludeVoiceOnlyBits() {
    let keys = Set(EchoChannelPermissionCatalog.defs(forChannelType: "text").map(\.key))
    #expect(keys.contains("SEND_MESSAGES"))
    #expect(!keys.contains("CONNECT"))
  }

  @Test func categoryDefsAreDeduplicatedUnion() {
    let keys = EchoChannelPermissionCatalog.category.map(\.key)
    #expect(Set(keys).count == keys.count)
    #expect(keys.contains("SEND_MESSAGES"))
    #expect(keys.contains("CONNECT"))
    #expect(keys.filter { $0 == "VIEW_CHANNEL" }.count == 1)
  }

  @Test func everyDefHasLabel() {
    for def in EchoChannelPermissionCatalog.category {
      #expect(def.label != def.key, "missing label for \(def.key)")
    }
  }
}
