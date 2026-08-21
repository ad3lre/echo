import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoMarkdownParserTests {
  @Test func settingsRoutesKeepStableIdentitySeparateFromPresentation() {
    #expect(EchoSettingsRoute.account.id == .account)
    #expect(EchoSettingsRoute.account.title == "Account")
    #expect(EchoSettingsRoute.dataPrivacy.title == "Data & Privacy")
    #expect(EchoSettingsRoute.allCases.map(\.id).count == 18)
  }

  @Test func parsesEchoBlockExtensions() {
    let blocks = EchoMarkdownParser.blocks(
      "# Heading\n\n> [!WARNING]\n> Check this\n\n- [ ] Todo\n- [x] Done\n\n```swift\nlet value = 1\n```\n\n| Name | Role |\n| --- | --- |\n| Echo | Member |"
    )

    #expect(blocks.count == 5)
    if case .heading(let level, let text) = blocks[0] {
      #expect(level == 1)
      #expect(text == "Heading")
    } else {
      Issue.record("Expected a heading block")
    }
    if case .quote(let text, let alert) = blocks[1] {
      #expect(text == "Check this")
      #expect(alert == .warning)
    } else {
      Issue.record("Expected an alert quote block")
    }
    if case .unordered(let items) = blocks[2] {
      #expect(items == ["☐  Todo", "☑  Done"])
    } else {
      Issue.record("Expected a task-list block")
    }
    if case .code(let language, let text) = blocks[3] {
      #expect(language == "swift")
      #expect(text == "let value = 1")
    } else {
      Issue.record("Expected a fenced-code block")
    }
    if case .table(let headers, let rows) = blocks[4] {
      #expect(headers == ["Name", "Role"])
      #expect(rows == [["Echo", "Member"]])
    } else {
      Issue.record("Expected a table block")
    }
  }

  @Test func escapedFenceRendersItsContentsAsMarkdown() {
    let blocks = EchoMarkdownParser.blocks("!```\n## Title\n**bold**\n```")

    #expect(blocks.count == 2)
    if case .heading(let level, let text) = blocks[0] {
      #expect(level == 2)
      #expect(text == "Title")
    } else {
      Issue.record("Expected escaped-fence heading")
    }
    if case .paragraph(let text) = blocks[1] {
      #expect(text == "**bold**")
      #expect(String(EchoMarkdownParser.inline(text).characters) == "bold")
    } else {
      Issue.record("Expected escaped-fence paragraph")
    }
  }

  @Test func inlineEchoSyntaxPreservesTextAndSupportsLinks() {
    let value = EchoMarkdownParser.inline(
      "**bold** *italic* ~~strike~~ __underlined__ ==marked== ||secret|| [Echo](https://chat-echo.com)"
    )

    #expect(
      String(value.characters)
        == "bold italic strike underlined marked secret Echo"
    )
    #expect(value.runs.count >= 7)
  }

  @Test func parsesInlineDisplayAndFootnoteMath() {
    let blocks = EchoMarkdownParser.blocks(
      "Energy $E = mc^2$\n\n$$\n\\int_0^1 x^2 dx\n$$\n\n[^1]\n\n[^1]: Source")

    #expect(
      blocks.contains { block in
        if case .math(let source, let display) = block {
          return source == "\\int_0^1 x^2 dx" && display
        }
        return false
      })
    #expect(
      blocks.contains { block in
        if case .footnoteReference(let label, _) = block { return label == "1" }
        return false
      })
    #expect(
      blocks.contains { block in
        if case .footnoteDefinition(let label, let text) = block {
          return label == "1" && text == "Source"
        }
        return false
      })
    #expect(EchoMarkdownParser.inlineSegments("Energy $E = mc^2$").count == 2)
  }

  @Test func recognizesDisplayMathAfterTextAndPreservesMatrixRowBreaks() {
    let blocks = EchoMarkdownParser.blocks(
      "Display math:\n$$\n\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}\n$$")

    #expect(
      blocks.contains { block in
        if case .math(let source, let display) = block {
          return display && source.contains("\\\\")
        }
        return false
      })
  }

  @Test func stripsStandaloneHTMLTagsFromMessageText() {
    #expect(String(EchoMarkdownParser.inline("Before</div>After").characters) == "BeforeAfter")
    let blocks = EchoMarkdownParser.blocks("</div>")
    #expect(blocks.count == 1)
    if case .rawHTML = blocks[0] {
      // The view drops empty tags instead of displaying the literal HTML.
    } else {
      Issue.record("Expected standalone HTML to be isolated for sanitization")
    }
  }
}
