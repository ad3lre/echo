import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoPaperTests {
  private static let sample = """
    {"channelId":"c1","revision":3,"canAuthorPaper":true,"contentJson":{"type":"doc","content":[
      {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Plan"}]},
      {"type":"paragraph","content":[
        {"type":"text","text":"Hello ","marks":[{"type":"bold"}]},
        {"type":"hardBreak"},
        {"type":"text","text":"world","marks":[{"type":"link","attrs":{"href":"https://echo.example"}}]}]},
      {"type":"orderedList","attrs":{"start":1},"content":[
        {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"one"}]}]}]},
      {"type":"paperShape","attrs":{"kind":{"nested":true}},"content":[
        {"type":"paragraph","content":[{"type":"text","text":"in shape"}]}]}
    ]}}
    """

  @Test func paperChannelIsListable() {
    let paper = EchoGuildChannel(id: "p1", name: "notes", type: "paper")
    #expect(paper.isPaper)
    #expect(paper.isListable)
    #expect(!paper.isTextLike)
    #expect(!EchoGuildChannel(id: "t1", name: "general", type: "text").isPaper)
  }

  @Test func decodesDocumentAndToleratesNestedAttrs() throws {
    let doc = try JSONDecoder().decode(EchoPaperDocument.self, from: Data(Self.sample.utf8))
    #expect(doc.channelID == "c1")
    #expect(doc.revision == 3)
    #expect(doc.canAuthorPaper)
    #expect(doc.content.content.count == 4)
    #expect(doc.content.content[0].intAttr("level") == 2)
    #expect(doc.content.content[3].plainText == "in shape")
  }

  @Test func inlineRendersMarksBreaksAndLinks() throws {
    let doc = try JSONDecoder().decode(EchoPaperDocument.self, from: Data(Self.sample.utf8))
    let paragraph = doc.content.content[1]
    let attributed = EchoPaperInline.attributed(paragraph.content)
    #expect(String(attributed.characters) == "Hello \nworld")
    #expect(attributed.runs.contains { $0.inlinePresentationIntent == .stronglyEmphasized })
    #expect(attributed.runs.contains { $0.link?.host == "echo.example" })
  }

  @Test func draftEditsTextAndPreservesLockedBlocks() throws {
    let json = """
      {"type":"doc","content":[
      {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Plan"}]},
      {"type":"paragraph","content":[{"type":"text","text":"a"},{"type":"hardBreak"},{"type":"text","text":"b"}]},
      {"type":"paragraph","content":[{"type":"mentionEntity","attrs":{"label":"x"}}]},
      {"type":"paperShape","attrs":{"kind":{"nested":true}}}]}
      """
    var draft = try #require(EchoPaperDraft(contentJSON: Data(json.utf8)))
    #expect(!draft.isDirty)
    #expect(draft.blocks.map(\.isEditable) == [true, true, false, false])
    #expect(draft.blocks[1].text == "a\nb")

    draft.blocks[0].text = "New plan"
    draft.appendParagraph()
    #expect(draft.isDirty)

    let out = try #require(draft.encoded())
    let root = try #require(try JSONSerialization.jsonObject(with: out) as? [String: Any])
    let blocks = try #require(root["content"] as? [[String: Any]])
    #expect(blocks.count == 5)
    #expect(blocks[3]["type"] as? String == "paperShape")
    let heading = try #require(blocks[0]["content"] as? [[String: Any]])
    #expect(heading.first?["text"] as? String == "New plan")
    #expect((blocks[0]["attrs"] as? [String: Any])?["level"] as? Int == 2)
    #expect(blocks[4]["content"] == nil)
  }

  @Test func draftEditsListsQuotesAndCode() throws {
    let json = """
      {"type":"doc","content":[
      {"type":"orderedList","attrs":{"start":1},"content":[
        {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"one"}]}]},
        {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"two"}]}]}]},
      {"type":"blockquote","content":[
        {"type":"paragraph","content":[{"type":"text","text":"quoted"}]}]},
      {"type":"codeBlock","content":[{"type":"text","text":"let x = 1"}]},
      {"type":"paperShape","attrs":{"kind":{"nested":true}}}]}
      """
    var draft = try #require(EchoPaperDraft(contentJSON: Data(json.utf8)))
    #expect(draft.blocks.map(\.isEditable) == [true, true, true, false])
    #expect(draft.blocks[0].text == "one\ntwo")
    #expect(draft.blocks[1].text == "quoted")
    #expect(draft.blocks[2].text == "let x = 1")

    draft.blocks[0].text = "alpha\nbeta\ngamma"
    draft.blocks[1].text = "line a\nline b"
    draft.blocks[2].text = "print(1)"
    let out = try #require(draft.encoded())
    let root = try #require(try JSONSerialization.jsonObject(with: out) as? [String: Any])
    let blocks = try #require(root["content"] as? [[String: Any]])
    let items = try #require(blocks[0]["content"] as? [[String: Any]])
    #expect(items.count == 3)
    #expect(blocks[0]["type"] as? String == "orderedList")
    #expect((blocks[0]["attrs"] as? [String: Any])?["start"] as? Int == 1)
    let quotes = try #require(blocks[1]["content"] as? [[String: Any]])
    #expect(quotes.count == 2)
    let code = try #require(blocks[2]["content"] as? [[String: Any]])
    #expect(code.first?["text"] as? String == "print(1)")
    #expect(blocks[3]["type"] as? String == "paperShape")
  }

  @Test func draftConvertsBlockKindsAndPreservesAttribution() throws {
    let json = """
      {"type":"doc","content":[
      {"type":"paragraph","attrs":{"paperBlockId":"b1","authorId":"u1"},
       "content":[{"type":"text","text":"hello"}]}]}
      """
    var draft = try #require(EchoPaperDraft(contentJSON: Data(json.utf8)))
    draft.convert(id: draft.blocks[0].id, to: .heading)
    #expect(draft.isDirty)
    #expect(draft.blocks[0].kind == .heading)
    draft.append(kind: .bulletList)
    let out = try #require(draft.encoded())
    let root = try #require(try JSONSerialization.jsonObject(with: out) as? [String: Any])
    let blocks = try #require(root["content"] as? [[String: Any]])
    #expect(blocks[0]["type"] as? String == "heading")
    let attrs = try #require(blocks[0]["attrs"] as? [String: Any])
    #expect(attrs["paperBlockId"] as? String == "b1")
    #expect(attrs["authorId"] as? String == "u1")
    #expect(attrs["level"] as? Int == 2)
    #expect(blocks[1]["type"] as? String == "bulletList")
  }

  @Test func unsafeLinkSchemeIsDropped() {
    let node = EchoPaperNode(
      type: "text", text: "x",
      marks: [EchoPaperMark(type: "link", attrs: ["href": .string("javascript:alert(1)")])])
    #expect(EchoPaperInline.attributed([node]).runs.allSatisfy { $0.link == nil })
  }

  @Test func commentDecodesAndFlagsResolved() throws {
    let json = """
      {"id":"c1","channelId":"ch","anchorBlockId":"b1","anchorFrom":0,"anchorTo":4,
       "anchorQuote":"Plan","authorId":"u1","body":"Looks good","parentCommentId":null,
       "resolvedAt":"2026-01-02T00:00:00Z","resolvedByUserId":"u1",
       "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}
      """
    let comment = try JSONDecoder().decode(EchoPaperComment.self, from: Data(json.utf8))
    #expect(comment.isTopLevel && comment.isResolved)
    #expect(comment.anchorQuote == "Plan" && comment.body == "Looks good")
  }

  @Test func documentDecodesCommentCapabilities() throws {
    let json = """
      {"channelId":"c1","revision":1,"canAuthorPaper":true,"canCommentOnPaper":true,
       "canManagePaperComments":false,"paperCommentsEnabled":true,"paperShowAuthorGutter":false,
       "contentJson":{"type":"doc","content":[{"type":"paragraph"}]}}
      """
    let doc = try JSONDecoder().decode(EchoPaperDocument.self, from: Data(json.utf8))
    #expect(doc.canCommentOnPaper && doc.paperCommentsEnabled && !doc.canManagePaperComments)
    #expect(!doc.paperShowAuthorGutter)
  }

  @Test func authorGutterMergesConsecutiveSameAuthor() {
    let rows = [
      EchoPaperGutterRow(paperBlockID: "b1", authorID: "user-a", coAuthorIDs: nil, order: 0, top: 0, height: 24),
      EchoPaperGutterRow(paperBlockID: "b2", authorID: "user-a", coAuthorIDs: nil, order: 1, top: 30, height: 24),
      EchoPaperGutterRow(paperBlockID: "b3", authorID: "user-a", coAuthorIDs: nil, order: 2, top: 60, height: 24),
    ]
    let segments = EchoPaperAuthorGutter.computeSegments(rows)
    #expect(segments.count == 1)
    #expect(segments[0].paperBlockIDs == ["b1", "b2", "b3"])
    #expect(segments[0].authorIDs == ["user-a"])
    #expect(segments[0].height == 84)
  }

  @Test func authorGutterKeepsZigzagAuthorsSeparate() {
    let rows = [
      EchoPaperGutterRow(paperBlockID: "b1", authorID: "user-a", coAuthorIDs: nil, order: 0, top: 0, height: 24),
      EchoPaperGutterRow(paperBlockID: "b2", authorID: "user-b", coAuthorIDs: nil, order: 1, top: 30, height: 24),
      EchoPaperGutterRow(paperBlockID: "b3", authorID: "user-a", coAuthorIDs: nil, order: 2, top: 60, height: 24),
    ]
    let segments = EchoPaperAuthorGutter.computeSegments(rows)
    #expect(segments.map(\.paperBlockIDs) == [["b1"], ["b2"], ["b3"]])
  }

  @Test func authorGutterIsolatesSharedCreditRuns() {
    let rows = [
      EchoPaperGutterRow(paperBlockID: "b1", authorID: "user-a", coAuthorIDs: nil, order: 0, top: 0, height: 24),
      EchoPaperGutterRow(
        paperBlockID: "b2", authorID: "user-b", coAuthorIDs: ["user-a", "user-b"], order: 1, top: 30,
        height: 24),
      EchoPaperGutterRow(paperBlockID: "b3", authorID: "user-a", coAuthorIDs: nil, order: 2, top: 60, height: 24),
    ]
    let segments = EchoPaperAuthorGutter.computeSegments(rows)
    #expect(segments.count == 3)
    #expect(segments[1].sharedCredit)
    #expect(Set(segments[1].authorIDs) == Set(["user-a", "user-b"]))
    #expect(segments[1].paperBlockIDs == ["b2"])
  }

  @Test func authorGutterRowsReadBlockAttrsIncludingCoAuthors() throws {
    let json = """
      {"channelId":"c1","revision":1,"paperShowAuthorGutter":true,
       "contentJson":{"type":"doc","content":[
         {"type":"paragraph","attrs":{"paperBlockId":"b1","authorId":"u1"},
          "content":[{"type":"text","text":"a"}]},
         {"type":"heading","attrs":{"level":2,"paperBlockId":"b2","authorId":"u2",
          "coAuthorIds":["u1","u2"]},"content":[{"type":"text","text":"b"}]},
         {"type":"paragraph","content":[{"type":"text","text":"no id"}]}
       ]}}
      """
    let doc = try JSONDecoder().decode(EchoPaperDocument.self, from: Data(json.utf8))
    #expect(doc.paperShowAuthorGutter)
    let rows = EchoPaperAuthorGutter.rows(from: doc.content)
    #expect(rows.map(\.paperBlockID) == ["b1", "b2"])
    #expect(rows[0].authorID == "u1" && rows[0].coAuthorIDs == nil)
    #expect(rows[1].coAuthorIDs == ["u1", "u2"])
    #expect(EchoPaperAuthorGutter.computeSegments(rows).count == 2)
  }

  @Test func shareSettingsPreferAbsoluteAndRebuildEmptyOrigin() throws {
    let json = """
      {"channelId":"c1","serverId":"s1","visibility":"global","shareUrl":"/channels/s1/c1",
       "publicShareUrl":null,"shareToken":"tok","canManageShare":true,
       "audience":{"visibility":"global","headline":"Anyone with the link","detail":"Public"}}
      """
    let settings = try JSONDecoder().decode(EchoPaperShareSettings.self, from: Data(json.utf8))
    #expect(settings.visibility == .global && settings.canManageShare)
    let base = URL(string: "https://chat-echo.com")!
    #expect(settings.preferredLink(webBase: base) == "https://chat-echo.com/paper/s/tok")

    let serverJSON = """
      {"channelId":"c1","serverId":"s1","visibility":"server","shareUrl":"https://chat-echo.com/channels/s1/c1",
       "publicShareUrl":null,"shareToken":null,"canManageShare":false,
       "audience":{"visibility":"server","headline":"Server members","detail":"Roles"}}
      """
    let server = try JSONDecoder().decode(EchoPaperShareSettings.self, from: Data(serverJSON.utf8))
    #expect(server.preferredLink(webBase: base) == "https://chat-echo.com/channels/s1/c1")
  }
}
