import EchoDomain
import SwiftUI

/// One measured/attributable top-level paper block (web `PaperGutterRow`).
struct EchoPaperGutterRow: Equatable, Sendable {
  let paperBlockID: String
  let authorID: String
  let coAuthorIDs: [String]?
  /// Document order index among attributable blocks (used when geometry is unavailable).
  let order: Int
  var top: CGFloat
  var height: CGFloat
}

/// Collapsed consecutive-authorship run (web `PaperAuthorSegment`).
struct EchoPaperAuthorSegment: Equatable, Identifiable, Sendable {
  var id: String { segmentID }
  let segmentID: String
  let authorIDs: [String]
  let paperBlockIDs: [String]
  let top: CGFloat
  let height: CGFloat
  let sharedCredit: Bool
}

/// Pure author-gutter helpers — port of web `computePaperAuthorSegments` / `paperAuthorColor`.
enum EchoPaperAuthorGutter {
  static let blockTypes: Set<String> = [
    "paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "image",
    "table", "horizontalRule",
  ]

  static let columnWidth: CGFloat = 48

  static func authorKey(for row: EchoPaperGutterRow) -> String {
    if let co = row.coAuthorIDs, co.count >= 2 {
      let ids = Array(Set(co + [row.authorID].filter { !$0.isEmpty })).sorted()
      return "shared:\(ids.joined(separator: ","))"
    }
    return "author:\(row.authorID)"
  }

  static func authorIDs(for row: EchoPaperGutterRow) -> [String] {
    if let co = row.coAuthorIDs, co.count >= 2 {
      var seen = Set<String>()
      var out: [String] = []
      for id in co + (row.authorID.isEmpty ? [] : [row.authorID]) where seen.insert(id).inserted {
        out.append(id)
        if out.count == 2 { break }
      }
      return out
    }
    return row.authorID.isEmpty ? [] : [row.authorID]
  }

  /// Collapse consecutive blocks with the same authorship into one gutter segment.
  static func computeSegments(_ rows: [EchoPaperGutterRow]) -> [EchoPaperAuthorSegment] {
    guard !rows.isEmpty else { return [] }
    let sorted = rows.sorted {
      if $0.top != $1.top { return $0.top < $1.top }
      return $0.order < $1.order
    }
    var segments: [EchoPaperAuthorSegment] = []
    var runKey = authorKey(for: sorted[0])
    var runRows = [sorted[0]]

    func flush() {
      guard let first = runRows.first, let last = runRows.last else { return }
      let ids = authorIDs(for: first)
      segments.append(
        EchoPaperAuthorSegment(
          segmentID: "\(runKey):\(first.paperBlockID)",
          authorIDs: ids,
          paperBlockIDs: runRows.map(\.paperBlockID),
          top: first.top,
          height: last.top + last.height - first.top,
          sharedCredit: ids.count >= 2
        ))
    }

    for row in sorted.dropFirst() {
      let key = authorKey(for: row)
      if key == runKey {
        runRows.append(row)
      } else {
        flush()
        runKey = key
        runRows = [row]
      }
    }
    flush()
    return segments
  }

  /// Top-level attributable blocks from a paper `doc` (or a single block root).
  static func rows(from content: EchoPaperNode) -> [EchoPaperGutterRow] {
    let blocks = content.type == "doc" ? content.content : [content]
    var out: [EchoPaperGutterRow] = []
    out.reserveCapacity(blocks.count)
    for (index, block) in blocks.enumerated() {
      guard blockTypes.contains(block.type), let id = block.paperBlockID else { continue }
      out.append(
        EchoPaperGutterRow(
          paperBlockID: id,
          authorID: block.paperAuthorID ?? "",
          coAuthorIDs: block.paperCoAuthorIDs,
          order: index,
          top: CGFloat(index) * 40,
          height: 40
        ))
    }
    return out
  }

  /// Stable HSL-ish accent from a user id (web `paperAuthorColor`).
  static func authorColor(userID: String) -> Color {
    var hash: UInt32 = 0
    for byte in userID.utf8 {
      hash = hash &* 31 &+ UInt32(byte)
    }
    let hue = Double(hash % 360) / 360
    return Color(hue: hue, saturation: 0.55, brightness: 0.55)
  }
}

/// Compact avatar (or pair) for one author segment in the paper gutter.
struct EchoPaperGutterAvatar: View {
  let authorIDs: [String]
  let sharedCredit: Bool
  let resolveName: (String) -> String
  let resolveAvatar: (String) -> String?
  let baseURL: URL
  let accessToken: String?

  var body: some View {
    if sharedCredit, authorIDs.count >= 2 {
      ZStack {
        avatar(authorIDs[0], size: 22)
          .offset(x: -6)
        avatar(authorIDs[1], size: 22)
          .offset(x: 6)
      }
      .frame(width: 36, height: 28)
    } else if let id = authorIDs.first {
      avatar(id, size: 28)
    }
  }

  private func avatar(_ userID: String, size: CGFloat) -> some View {
    let name = resolveName(userID)
    return EchoMediaImage(source: resolveAvatar(userID), baseURL: baseURL, accessToken: accessToken)
    {
      EchoGeneratedAvatar(name: name, seed: userID)
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().strokeBorder(EchoPaperAuthorGutter.authorColor(userID: userID), lineWidth: 2))
  }
}

/// Read-mode document column with an optional left author gutter (web `PaperAuthorGutter`).
struct EchoPaperReadDocument: View {
  let document: EchoPaperDocument
  let membersByID: [String: EchoServerMember]
  let baseURL: URL
  let accessToken: String?

  private var showGutter: Bool { document.paperShowAuthorGutter }
  private var topLevel: [EchoPaperNode] {
    document.content.type == "doc" ? document.content.content : [document.content]
  }

  private var authorKeys: [String: String] {
    EchoPaperAuthorGutter.rows(from: document.content).reduce(into: [:]) { map, row in
      map[row.paperBlockID] = EchoPaperAuthorGutter.authorKey(for: row)
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(topLevel.enumerated()), id: \.offset) { index, block in
        HStack(alignment: .top, spacing: 8) {
          if showGutter {
            gutterCell(
              block: block, previous: index > 0 ? topLevel[index - 1] : nil, keys: authorKeys)
              .frame(width: EchoPaperAuthorGutter.columnWidth, alignment: .top)
          }
          EchoPaperBlockView(node: block)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(showGutter ? EchoCopy.string("Document authors") : "")
  }

  @ViewBuilder
  private func gutterCell(
    block: EchoPaperNode, previous: EchoPaperNode?, keys: [String: String]
  ) -> some View {
    let id = block.paperBlockID
    let key = id.flatMap { keys[$0] }
    let prevKey = previous?.paperBlockID.flatMap { keys[$0] }
    let startsRun = key != nil && key != prevKey
    if startsRun, let id {
      let row = EchoPaperGutterRow(
        paperBlockID: id,
        authorID: block.paperAuthorID ?? "",
        coAuthorIDs: block.paperCoAuthorIDs,
        order: 0, top: 0, height: 0)
      let authorIDs = EchoPaperAuthorGutter.authorIDs(for: row)
      EchoPaperGutterAvatar(
        authorIDs: authorIDs,
        sharedCredit: authorIDs.count >= 2,
        resolveName: { membersByID[$0]?.name ?? $0 },
        resolveAvatar: { membersByID[$0]?.avatarURL },
        baseURL: baseURL,
        accessToken: accessToken
      )
      .padding(.top, 2)
      .accessibilityLabel(segmentTitle(authorIDs: authorIDs, shared: authorIDs.count >= 2))
      .accessibilityAddTraits(.isButton)
    } else {
      Color.clear.frame(width: 28, height: 28)
        .accessibilityHidden(true)
    }
  }

  private func segmentTitle(authorIDs: [String], shared: Bool) -> String {
    let names = authorIDs.map { membersByID[$0]?.name ?? $0 }
    if shared, names.count >= 2 { return "\(names[0]) & \(names[1])" }
    return names.first ?? ""
  }
}
