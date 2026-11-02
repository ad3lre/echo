import Foundation

/// Scalar node/mark attribute (`level`, `href`, `start`, …); nested JSON decodes as `.other`.
public enum EchoPaperAttr: Decodable, Equatable, Sendable {
  case string(String)
  case number(Double)
  case bool(Bool)
  /// TipTap array attrs such as `coAuthorIds`.
  case stringArray([String])
  case other

  public init(from decoder: Decoder) throws {
    let box = try decoder.singleValueContainer()
    if let value = try? box.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? box.decode(Double.self) {
      self = .number(value)
    } else if let value = try? box.decode(String.self) {
      self = .string(value)
    } else if let value = try? box.decode([String].self) {
      self = .stringArray(value)
    } else {
      self = .other
    }
  }
}

public struct EchoPaperMark: Decodable, Equatable, Sendable {
  public let type: String
  public let attrs: [String: EchoPaperAttr]

  public init(type: String, attrs: [String: EchoPaperAttr] = [:]) {
    self.type = type
    self.attrs = attrs
  }

  private enum CodingKeys: String, CodingKey { case type, attrs }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    type = try c.decode(String.self, forKey: .type)
    attrs = (try? c.decodeIfPresent([String: EchoPaperAttr].self, forKey: .attrs)) ?? [:]
  }
}

/// One TipTap/ProseMirror JSON node (`doc`, `paragraph`, `text`, `paperShape`, …).
public struct EchoPaperNode: Decodable, Equatable, Sendable {
  public let type: String
  public let attrs: [String: EchoPaperAttr]
  public let content: [EchoPaperNode]
  public let text: String?
  public let marks: [EchoPaperMark]

  public init(
    type: String,
    attrs: [String: EchoPaperAttr] = [:],
    content: [EchoPaperNode] = [],
    text: String? = nil,
    marks: [EchoPaperMark] = []
  ) {
    self.type = type
    self.attrs = attrs
    self.content = content
    self.text = text
    self.marks = marks
  }

  private enum CodingKeys: String, CodingKey { case type, attrs, content, text, marks }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    type = try c.decode(String.self, forKey: .type)
    attrs = (try? c.decodeIfPresent([String: EchoPaperAttr].self, forKey: .attrs)) ?? [:]
    content = (try? c.decodeIfPresent([EchoPaperNode].self, forKey: .content)) ?? []
    text = try? c.decodeIfPresent(String.self, forKey: .text)
    marks = (try? c.decodeIfPresent([EchoPaperMark].self, forKey: .marks)) ?? []
  }

  public func stringAttr(_ key: String) -> String? {
    if case .string(let value)? = attrs[key] { return value }
    return nil
  }

  public func stringArrayAttr(_ key: String) -> [String]? {
    if case .stringArray(let value)? = attrs[key] { return value }
    return nil
  }

  public func intAttr(_ key: String) -> Int? {
    if case .number(let value)? = attrs[key] { return Int(value) }
    return nil
  }

  /// TipTap block id used by author gutter / comments (`attrs.paperBlockId`).
  public var paperBlockID: String? {
    let id = stringAttr("paperBlockId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return id.isEmpty ? nil : id
  }

  /// Last editor user id (`attrs.authorId`).
  public var paperAuthorID: String? {
    let id = stringAttr("authorId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return id.isEmpty ? nil : id
  }

  /// Shared-credit co-authors (`attrs.coAuthorIds`), trimmed and capped at 2 like web.
  public var paperCoAuthorIDs: [String]? {
    guard let raw = stringArrayAttr("coAuthorIds") else { return nil }
    let ids = raw.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    return ids.count >= 2 ? Array(ids.prefix(2)) : nil
  }

  /// Readable text for nodes the renderer has no layout for (shapes, tables, embeds).
  public var plainText: String {
    if let text { return text }
    if type == "hardBreak" { return "\n" }
    if content.isEmpty {
      return stringAttr("label") ?? stringAttr("name") ?? stringAttr("text") ?? ""
    }
    let parts = content.map(\.plainText)
    return content.allSatisfy({ Self.inlineTypes.contains($0.type) })
      ? parts.joined()
      : parts.filter { !$0.isEmpty }.joined(separator: "\n")
  }

  static let inlineTypes: Set<String> = [
    "text", "hardBreak", "mentionEntity", "channelMention", "customEmoji", "appIcon",
  ]
}

/// Who can open a paper share URL (`contracts/types/paperShare.ts`).
public enum EchoPaperShareVisibility: String, CaseIterable, Codable, Sendable, Hashable {
  case server
  case `private`
  case global
}

/// Audience copy returned with share settings (`buildPaperShareAudience`).
public struct EchoPaperShareAudience: Decodable, Equatable, Sendable, Hashable {
  public let visibility: EchoPaperShareVisibility
  public let headline: String
  public let detail: String

  public init(
    visibility: EchoPaperShareVisibility, headline: String, detail: String
  ) {
    self.visibility = visibility
    self.headline = headline
    self.detail = detail
  }
}

/// `GET|PATCH /channels/:id/paper/share`.
public struct EchoPaperShareSettings: Decodable, Equatable, Sendable, Hashable {
  public let channelID: String
  public let serverID: String
  public let visibility: EchoPaperShareVisibility
  public let shareURL: String
  public let publicShareURL: String?
  public let shareToken: String?
  public let audience: EchoPaperShareAudience
  public let canManageShare: Bool

  public init(
    channelID: String,
    serverID: String,
    visibility: EchoPaperShareVisibility,
    shareURL: String,
    publicShareURL: String? = nil,
    shareToken: String? = nil,
    audience: EchoPaperShareAudience,
    canManageShare: Bool
  ) {
    self.channelID = channelID
    self.serverID = serverID
    self.visibility = visibility
    self.shareURL = shareURL
    self.publicShareURL = publicShareURL
    self.shareToken = shareToken
    self.audience = audience
    self.canManageShare = canManageShare
  }

  private enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case serverID = "serverId"
    case visibility, shareUrl, publicShareUrl, shareToken, audience, canManageShare
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    channelID = try c.decode(String.self, forKey: .channelID)
    serverID = try c.decode(String.self, forKey: .serverID)
    visibility = try c.decode(EchoPaperShareVisibility.self, forKey: .visibility)
    shareURL = (try? c.decodeIfPresent(String.self, forKey: .shareUrl)) ?? ""
    publicShareURL = try? c.decodeIfPresent(String.self, forKey: .publicShareUrl)
    shareToken = try? c.decodeIfPresent(String.self, forKey: .shareToken)
    audience = try c.decode(EchoPaperShareAudience.self, forKey: .audience)
    canManageShare = (try? c.decodeIfPresent(Bool.self, forKey: .canManageShare)) ?? false
  }

  /// Prefer a usable absolute URL; rebuild from `webBase` when the API omitted Origin.
  public func preferredLink(webBase: URL) -> String {
    if visibility == .global, let token = shareToken?.trimmingCharacters(in: .whitespacesAndNewlines),
      !token.isEmpty
    {
      if let publicShareURL, let url = URL(string: publicShareURL), url.host != nil {
        return publicShareURL
      }
      return webBase.appending(path: "paper/s/\(token)").absoluteString
    }
    if let url = URL(string: shareURL), url.host != nil { return shareURL }
    return webBase.appending(path: "channels/\(serverID)/\(channelID)").absoluteString
  }
}

/// `GET /channels/:id/paper` — the single document behind a `type: paper` channel.
public struct EchoPaperDocument: Decodable, Equatable, Sendable {
  public let channelID: String
  public let content: EchoPaperNode
  public let revision: Int
  public let updatedAt: String?
  public let paperCommentsEnabled: Bool
  public let paperShowAuthorGutter: Bool
  public let canAuthorPaper: Bool
  public let canCommentOnPaper: Bool
  public let canManagePaperComments: Bool

  public init(
    channelID: String, content: EchoPaperNode, revision: Int = 0,
    updatedAt: String? = nil, paperCommentsEnabled: Bool = true,
    paperShowAuthorGutter: Bool = true, canAuthorPaper: Bool = false,
    canCommentOnPaper: Bool = false, canManagePaperComments: Bool = false
  ) {
    self.channelID = channelID
    self.content = content
    self.revision = revision
    self.updatedAt = updatedAt
    self.paperCommentsEnabled = paperCommentsEnabled
    self.paperShowAuthorGutter = paperShowAuthorGutter
    self.canAuthorPaper = canAuthorPaper
    self.canCommentOnPaper = canCommentOnPaper
    self.canManagePaperComments = canManagePaperComments
  }

  private enum CodingKeys: String, CodingKey {
    case channelID = "channelId"
    case content = "contentJson"
    case revision, updatedAt, paperCommentsEnabled, paperShowAuthorGutter, canAuthorPaper,
      canCommentOnPaper, canManagePaperComments
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    channelID = try c.decode(String.self, forKey: .channelID)
    content = try c.decode(EchoPaperNode.self, forKey: .content)
    revision = (try? c.decodeIfPresent(Int.self, forKey: .revision)) ?? 0
    updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
    paperCommentsEnabled =
      (try? c.decodeIfPresent(Bool.self, forKey: .paperCommentsEnabled)) ?? true
    paperShowAuthorGutter =
      (try? c.decodeIfPresent(Bool.self, forKey: .paperShowAuthorGutter)) ?? true
    canAuthorPaper = (try? c.decodeIfPresent(Bool.self, forKey: .canAuthorPaper)) ?? false
    canCommentOnPaper = (try? c.decodeIfPresent(Bool.self, forKey: .canCommentOnPaper)) ?? false
    canManagePaperComments =
      (try? c.decodeIfPresent(Bool.self, forKey: .canManagePaperComments)) ?? false
  }
}
