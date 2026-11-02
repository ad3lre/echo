import EchoDomain
import Foundation

/// Composer slash palette — port of web `chatSlashCommands.ts`.
struct EchoSlashCommand: Identifiable, Equatable {
  enum Group: Int, CaseIterable {
    case media, blocks, markdown, math

    var title: String {
      switch self {
      case .media: EchoCopy.string("Media & polls")
      case .blocks: EchoCopy.string("Rich blocks")
      case .markdown: EchoCopy.string("Markdown")
      case .math: EchoCopy.string("Math (LaTeX)")
      }
    }

    var key: String {
      switch self {
      case .media: "media"
      case .blocks: "blocks"
      case .markdown: "markdown"
      case .math: "math"
      }
    }
  }

  /// Web `markdownWrapDelimiters`.
  enum Wrap: Equatable {
    case bold, italic, strike, inlineCode, spoiler

    var delimiters: (prefix: String, suffix: String) {
      switch self {
      case .bold: ("**", "**")
      case .italic: ("*", "*")
      case .strike: ("~~", "~~")
      case .inlineCode: ("`", "`")
      case .spoiler: ("||", "||")
      }
    }
  }

  enum Action: Equatable {
    case upload
    case poll
    case gif
    case imageSlot(w: Int, h: Int)
    case buttonRow([EchoComposerButton])
    case markdownWrap(Wrap)
    /// `cursorOffset` is relative to the end of the inserted text (negative = back).
    case insertText(String, cursorOffset: Int)
  }

  /// Token after `/` (`poll`, `imageslot-16-9`).
  let name: String
  let label: String
  let detail: String
  let group: Group
  var preview: String? = nil
  var keywords: [String] = []
  let action: Action

  var id: String { name }
}

struct EchoSlashContext: Equatable {
  var mediaAllowed: Bool
  var pollAllowed: Bool
  var editing: Bool
}

enum EchoSlashCommands {
  static let suggestionLimit = 14

  static func catalog(_ context: EchoSlashContext) -> [EchoSlashCommand] {
    media(context) + blocks() + markdown() + math()
  }

  // MARK: Filtering (web `filterSlashCommands`)

  static func filter(_ commands: [EchoSlashCommand], query: String) -> [EchoSlashCommand] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if q.isEmpty {
      return commands.sorted { lhs, rhs in
        if lhs.group != rhs.group { return lhs.group.rawValue < rhs.group.rawValue }
        return lhs.label.localizedCompare(rhs.label) == .orderedAscending
      }
    }
    return commands.compactMap { command -> (EchoSlashCommand, Int)? in
      let score = score(command, q)
      return score >= 0 ? (command, score) : nil
    }
    .sorted { lhs, rhs in
      if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
      return lhs.0.label.localizedCompare(rhs.0.label) == .orderedAscending
    }
    .map(\.0)
  }

  private static func score(_ command: EchoSlashCommand, _ q: String) -> Int {
    if command.name == q { return 100 }
    if command.name.hasPrefix(q) { return 90 }
    if command.keywords.contains(where: { $0 == q || $0.hasPrefix(q) }) { return 75 }
    if command.label.lowercased().contains(q) { return 55 }
    if command.detail.lowercased().contains(q) { return 45 }
    if command.preview?.lowercased().contains(q) == true { return 40 }
    if command.group.key.contains(q) { return 30 }
    if command.keywords.contains(where: { $0.contains(q) }) { return 25 }
    if command.name.contains(q) { return 20 }
    return -1
  }

  // MARK: Trigger (`/command` at line start or after whitespace)

  /// Active `/query` before the caret — web `SLASH_TRIGGER = /(?:^|\s)\/([a-z0-9-]*)$/i`.
  static func trigger(text: String, caret: Int) -> (start: Int, query: String)? {
    let ns = text as NSString
    guard caret >= 0, caret <= ns.length else { return nil }
    let before = ns.substring(to: caret)
    guard let regex = try? NSRegularExpression(pattern: #"(?:^|\s)/([a-z0-9-]*)$"#, options: [.caseInsensitive]),
      let match = regex.firstMatch(
        in: before, range: NSRange(location: 0, length: (before as NSString).length))
    else { return nil }
    let query = (before as NSString).substring(with: match.range(at: 1))
    return (caret - (query as NSString).length - 1, query)
  }

  // MARK: Catalog

  private static func command(
    _ name: String, _ label: String, _ detail: String, _ group: EchoSlashCommand.Group,
    _ action: EchoSlashCommand.Action, keywords: [String] = [], preview: String? = nil
  ) -> EchoSlashCommand {
    EchoSlashCommand(
      name: name, label: label, detail: detail, group: group, preview: preview,
      keywords: keywords, action: action)
  }

  private static func media(_ context: EchoSlashContext) -> [EchoSlashCommand] {
    var out: [EchoSlashCommand] = []
    if context.mediaAllowed {
      out.append(
        command(
          "upload", EchoCopy.string("Upload file"),
          EchoCopy.string("Attach images, documents, and more"), .media, .upload))
      out.append(
        command(
          "gif", EchoCopy.string("GIF"), EchoCopy.string("Search and insert a GIF"), .media, .gif,
          keywords: ["giphy", "tenor", "animate"]))
    }
    if context.pollAllowed && !context.editing {
      out.append(
        command(
          "poll", EchoCopy.string("Create Poll"),
          EchoCopy.string("Ask a question with options"), .media, .poll,
          keywords: ["vote", "survey"]))
    }
    return out
  }

  private static func blocks() -> [EchoSlashCommand] {
    var out: [EchoSlashCommand] = [
      command(
        "image", EchoCopy.string("Image slot 16:9"),
        EchoCopy.string("Default widescreen placeholder"), .blocks, .imageSlot(w: 16, h: 9),
        keywords: ["imageslot", "slot", "16:9", "photo"], preview: "![image: ratio=16:9]")
    ]
    for ratio in echoImageSlotAspectRatios where !(ratio.w == 16 && ratio.h == 9) {
      out.append(
        command(
          "imageslot-\(ratio.w)-\(ratio.h)",
          EchoCopy.format("Image slot %lld:%lld", Int64(ratio.w), Int64(ratio.h)),
          EchoCopy.string("Placeholder image to fill later"), .blocks,
          .imageSlot(w: ratio.w, h: ratio.h),
          keywords: ["image", "slot", "\(ratio.w):\(ratio.h)", "\(ratio.w)x\(ratio.h)"],
          preview: "![image: ratio=\(ratio.w):\(ratio.h)]"))
    }
    let secondary = EchoComposerButton(label: "Button", style: 2, customID: "action")
    let primary = EchoComposerButton(label: "Continue", style: 1, customID: "continue")
    out.append(contentsOf: [
      command(
        "buttonrow", EchoCopy.string("Button row"),
        EchoCopy.string("Insert a secondary action button"), .blocks, .buttonRow([secondary]),
        keywords: ["button", "buttons", "actions"], preview: "![button: …]"),
      command(
        "buttonrow-confirm", EchoCopy.string("Confirm / Cancel row"),
        EchoCopy.string("Two-button confirmation row"), .blocks,
        .buttonRow([
          EchoComposerButton(label: "Confirm", style: 1, customID: "confirm"),
          EchoComposerButton(label: "Cancel", style: 2, customID: "cancel"),
        ]), keywords: ["confirm", "cancel", "dialog"]),
      command(
        "button-link", EchoCopy.string("Link button"),
        EchoCopy.string("Single button that opens a URL"), .blocks,
        .buttonRow([EchoComposerButton(label: "Link", style: 5, url: "https://example.com")]),
        keywords: ["url", "href", "website"], preview: "![button: label=Link, url=…]"),
      command(
        "button-primary", EchoCopy.string("Primary button"),
        EchoCopy.string("Highlighted call-to-action button"), .blocks, .buttonRow([primary]),
        keywords: ["cta", "continue"]),
      command(
        "button-success", EchoCopy.string("Success button"),
        EchoCopy.string("Positive confirmation button"), .blocks,
        .buttonRow([EchoComposerButton(label: "Done", style: 3, customID: "done")]),
        keywords: ["ok", "done", "green"]),
      command(
        "button-danger", EchoCopy.string("Danger button"),
        EchoCopy.string("Destructive action button"), .blocks,
        .buttonRow([
          EchoComposerButton(label: EchoCopy.string("Delete"), style: 4, customID: "delete")
        ]), keywords: ["delete", "remove", "red"]),
    ])
    return out
  }

  private static func markdown() -> [EchoSlashCommand] {
    func wrap(
      _ name: String, _ label: String, _ detail: String, _ kind: EchoSlashCommand.Wrap,
      _ keywords: [String], _ preview: String
    ) -> EchoSlashCommand {
      command(name, label, detail, .markdown, .markdownWrap(kind), keywords: keywords, preview: preview)
    }
    func insert(
      _ name: String, _ label: String, _ detail: String, _ text: String, _ offset: Int,
      _ keywords: [String], _ preview: String
    ) -> EchoSlashCommand {
      command(
        name, label, detail, .markdown, .insertText(text, cursorOffset: offset),
        keywords: keywords, preview: preview)
    }
    return [
      wrap("bold", EchoCopy.string("Bold"), EchoCopy.string("Wrap selection in **bold**"), .bold, ["strong", "b"], "**text**"),
      wrap("italic", EchoCopy.string("Italic"), EchoCopy.string("Wrap selection in *italic*"), .italic, ["em", "i"], "*text*"),
      wrap("strike", EchoCopy.string("Strikethrough"), EchoCopy.string("Wrap selection in ~~strike~~"), .strike, ["strikethrough", "del"], "~~text~~"),
      wrap("code", EchoCopy.string("Inline code"), EchoCopy.string("Wrap selection in backticks"), .inlineCode, ["monospace", "inline"], "`code`"),
      wrap("spoiler", EchoCopy.string("Spoiler"), EchoCopy.string("Hide text behind a spoiler tag"), .spoiler, ["hidden", "blur"], "||text||"),
      insert("highlight", EchoCopy.string("Highlight"), EchoCopy.string("Mark text with ==highlight=="), "==highlight==", -3, ["mark", "yellow"], "==text=="),
      insert("codeblock", EchoCopy.string("Code block"), EchoCopy.string("Fenced multiline code block"), "```\n\n```", -4, ["fence", "pre", "snippet"], "``` … ```"),
      insert("quote", EchoCopy.string("Blockquote"), EchoCopy.string("Start a quoted line"), "> ", 0, ["blockquote", "cite"], "> quote"),
      insert("h1", EchoCopy.string("Heading 1"), EchoCopy.string("Large section heading"), "# Heading\n", -8, ["heading1", "title"], "# Heading"),
      insert("h2", EchoCopy.string("Heading 2"), EchoCopy.string("Medium section heading"), "## Heading\n", -8, ["heading2", "subtitle"], "## Heading"),
      insert("h3", EchoCopy.string("Heading 3"), EchoCopy.string("Small section heading"), "### Heading\n", -8, ["heading3"], "### Heading"),
      insert("ul", EchoCopy.string("Bullet list"), EchoCopy.string("Start an unordered list item"), "- Item\n", -5, ["list", "bullet", "unordered"], "- item"),
      insert("ol", EchoCopy.string("Numbered list"), EchoCopy.string("Start an ordered list item"), "1. Item\n", -5, ["list", "numbered", "ordered"], "1. item"),
      insert("table", EchoCopy.string("Table"), EchoCopy.string("Simple 2×2 GitHub-style table"), "| Col A | Col B |\n| --- | --- |\n| A1 | B1 |\n", 0, ["grid", "columns"], "| A | B |"),
      insert("alert-note", EchoCopy.string("Note alert"), EchoCopy.string("GitHub-style note callout"), "> [!NOTE]\n> Useful information.\n\n", 0, ["callout", "info"], "> [!NOTE]"),
      insert("alert-tip", EchoCopy.string("Tip alert"), EchoCopy.string("Helpful tip callout"), "> [!TIP]\n> Helpful advice.\n\n", 0, ["callout", "hint"], "> [!TIP]"),
      insert("alert-warning", EchoCopy.string("Warning alert"), EchoCopy.string("Caution callout"), "> [!WARNING]\n> Be careful.\n\n", 0, ["callout", "caution"], "> [!WARNING]"),
      insert("alert-important", EchoCopy.string("Important alert"), EchoCopy.string("Critical information callout"), "> [!IMPORTANT]\n> Key information.\n\n", 0, ["callout", "critical"], "> [!IMPORTANT]"),
    ]
  }

  private static func math() -> [EchoSlashCommand] {
    func math(
      _ name: String, _ label: String, _ detail: String, _ text: String, _ offset: Int,
      _ keywords: [String], _ preview: String
    ) -> EchoSlashCommand {
      command(
        name, label, detail, .math, .insertText(text, cursorOffset: offset),
        keywords: keywords, preview: preview)
    }
    return [
      math("math", EchoCopy.string("Inline math"), EchoCopy.string("KaTeX inline formula with \\(\\)"), "\\( \\)", -3, ["latex", "inline", "katex", "formula"], "\\( … \\)"),
      math("mathblock", EchoCopy.string("Display math"), EchoCopy.string("Centered block formula with $$"), "$$\n\n$$", -3, ["latex", "display", "katex", "equation"], "$$ … $$"),
      math("frac", EchoCopy.string("Fraction"), EchoCopy.string("Inline fraction template"), "\\(\\frac{a}{b}\\)", -8, ["fraction", "divide"], "\\frac{a}{b}"),
      math("sqrt", EchoCopy.string("Square root"), EchoCopy.string("Inline square root"), "\\(\\sqrt{x}\\)", -5, ["root", "radical"], "\\sqrt{x}"),
      math("matrix", EchoCopy.string("Matrix"), EchoCopy.string("Bare matrix environment (display)"), "\\begin{matrix}\na & b \\\\\nc & d\n\\end{matrix}\n", 0, ["array", "grid", "linear-algebra"], "\\begin{matrix}"),
      math("align", EchoCopy.string("Aligned equations"), EchoCopy.string("Multi-line aligned display math"), "\\begin{align}\nx &= a + b \\\\\ny &= c + d\n\\end{align}\n", 0, ["aligned", "equations", "system"], "\\begin{align}"),
      math("sum", EchoCopy.string("Summation"), EchoCopy.string("Sigma summation notation"), "\\(\\sum_{i=1}^{n} x_i\\)", -6, ["sigma", "series"], "\\sum"),
      math("integral", EchoCopy.string("Integral"), EchoCopy.string("Definite integral template"), "\\(\\int_{a}^{b} f(x)\\,dx\\)", -8, ["calculus", "area"], "\\int"),
    ]
  }
}
