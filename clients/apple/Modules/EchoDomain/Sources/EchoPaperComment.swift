import Foundation

/// Margin / thread comment on a paper (`contracts/types/paper.ts` `PaperCommentPayload`).
public struct EchoPaperComment: Identifiable, Equatable, Sendable, Hashable, Decodable {
  public let id: String
  public let channelID: String
  public let anchorBlockID: String
  public let anchorFrom: Int?
  public let anchorTo: Int?
  public let anchorQuote: String
  public let authorID: String
  public let body: String
  public let parentCommentID: String?
  public let resolvedAt: String?
  public let resolvedByUserID: String?
  public let createdAt: String
  public let updatedAt: String

  public var isResolved: Bool {
    guard let resolvedAt else { return false }
    return !resolvedAt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  public var isTopLevel: Bool {
    guard let parentCommentID else { return true }
    return parentCommentID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  public init(
    id: String,
    channelID: String,
    anchorBlockID: String,
    anchorFrom: Int? = nil,
    anchorTo: Int? = nil,
    anchorQuote: String = "",
    authorID: String,
    body: String,
    parentCommentID: String? = nil,
    resolvedAt: String? = nil,
    resolvedByUserID: String? = nil,
    createdAt: String = "",
    updatedAt: String = ""
  ) {
    self.id = id
    self.channelID = channelID
    self.anchorBlockID = anchorBlockID
    self.anchorFrom = anchorFrom
    self.anchorTo = anchorTo
    self.anchorQuote = anchorQuote
    self.authorID = authorID
    self.body = body
    self.parentCommentID = parentCommentID
    self.resolvedAt = resolvedAt
    self.resolvedByUserID = resolvedByUserID
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case channelID = "channelId"
    case anchorBlockID = "anchorBlockId"
    case anchorFrom, anchorTo, anchorQuote
    case authorID = "authorId"
    case body
    case parentCommentID = "parentCommentId"
    case resolvedAt
    case resolvedByUserID = "resolvedByUserId"
    case createdAt, updatedAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    channelID = try c.decode(String.self, forKey: .channelID)
    anchorBlockID = (try? c.decodeIfPresent(String.self, forKey: .anchorBlockID)) ?? ""
    anchorFrom = try? c.decodeIfPresent(Int.self, forKey: .anchorFrom)
    anchorTo = try? c.decodeIfPresent(Int.self, forKey: .anchorTo)
    anchorQuote = (try? c.decodeIfPresent(String.self, forKey: .anchorQuote)) ?? ""
    authorID = try c.decode(String.self, forKey: .authorID)
    body = try c.decode(String.self, forKey: .body)
    parentCommentID = try? c.decodeIfPresent(String.self, forKey: .parentCommentID)
    resolvedAt = try? c.decodeIfPresent(String.self, forKey: .resolvedAt)
    resolvedByUserID = try? c.decodeIfPresent(String.self, forKey: .resolvedByUserID)
    createdAt = (try? c.decodeIfPresent(String.self, forKey: .createdAt)) ?? ""
    updatedAt = (try? c.decodeIfPresent(String.self, forKey: .updatedAt)) ?? ""
  }
}
