import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoServerSettingsPanelKitTests {
  @Test func sniffsImageKinds() {
    let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])
    #expect(EchoSettingsImage.sniff(png) == .png)

    var apng = png
    apng.append(Data("acTL".utf8))
    #expect(EchoSettingsImage.sniff(apng) == .apng)

    #expect(EchoSettingsImage.sniff(Data("GIF89a....".utf8)) == .gif)
    #expect(EchoSettingsImage.sniff(Data([0xFF, 0xD8, 0xFF, 0xE0])) == .jpeg)
    #expect(EchoSettingsImage.sniff(Data("not an image".utf8)) == nil)
  }

  @Test func expressionNamesAreSlugged() {
    #expect(
      EchoSettingsImage.expressionName(fromFilename: "party parrot!.gif", fallback: "emoji")
        == "party_parrot")
    #expect(EchoSettingsImage.expressionName(fromFilename: "a.png", fallback: "emoji") == "emoji")
  }

  @Test func packTagsDedupeAndLimit() {
    #expect(echoNormalizedPackTags("Cute, cute , Anime,,") == ["cute", "anime"])
    let many = (0..<20).map { "t\($0)" }.joined(separator: ",")
    #expect(echoNormalizedPackTags(many).count == 8)
  }

  @Test func eventDatesRoundTripWithMilliseconds() {
    let date = Date(timeIntervalSince1970: 1_800_000_000.25)
    let iso = EchoServerSettingsDates.iso(date)
    #expect(iso.hasSuffix("Z"))
    #expect(EchoServerSettingsDates.parse(iso) == date)
    #expect(EchoServerSettingsDates.parse("2030-01-01T00:00:00Z") != nil)
    #expect(EchoServerSettingsDates.parse("nope") == nil)
  }

  @Test func structureReorderInsertIndexMatchesWeb() {
    let ids = ["a", "b", "c"]
    #expect(
      EchoServerSettingsStructurePanel.reorderInsertIndex(
        orderedIDs: ids, draggedID: "b", insertBeforeID: "a") == 0)
    #expect(
      EchoServerSettingsStructurePanel.reorderInsertIndex(
        orderedIDs: ids, draggedID: "b", insertBeforeID: "c") == 1)
    #expect(
      EchoServerSettingsStructurePanel.reorderInsertIndex(
        orderedIDs: ids, draggedID: "b", insertBeforeID: nil) == 2)
    #expect(
      EchoServerSettingsStructurePanel.reorderInsertIndex(
        orderedIDs: ids, draggedID: "b", insertBeforeID: "b") == nil)
  }
}
