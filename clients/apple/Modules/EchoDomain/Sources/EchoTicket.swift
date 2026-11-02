import Foundation

/// Web `EchoTicketStatus` (`contracts/types/ticket.ts`).
public enum EchoTicketStatus: String, Equatable, Sendable, CaseIterable {
  case open
  case inProgress = "in_progress"
  case resolved
  case closed

  /// Unknown server values fall back to `open` so new statuses never crash decoding.
  public init(wire: String?) {
    self = Self(rawValue: wire?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "") ?? .open
  }
}

/// `POST /servers/:id/tickets` response row (web `EchoTicket`).
public struct EchoTicket: Identifiable, Equatable, Sendable {
  public let id: String
  public let serverID: String
  /// Private channel created for this ticket.
  public let channelID: String
  public let authorID: String
  public var subject: String
  public var category: String?
  public var status: EchoTicketStatus
  public var assignedTo: String?
  public let createdAt: String
  public var updatedAt: String
  public var closedAt: String?
  public var closedBy: String?

  public init(
    id: String,
    serverID: String,
    channelID: String,
    authorID: String,
    subject: String,
    category: String? = nil,
    status: EchoTicketStatus = .open,
    assignedTo: String? = nil,
    createdAt: String = "",
    updatedAt: String = "",
    closedAt: String? = nil,
    closedBy: String? = nil
  ) {
    self.id = id
    self.serverID = serverID
    self.channelID = channelID
    self.authorID = authorID
    self.subject = subject
    self.category = category
    self.status = status
    self.assignedTo = assignedTo
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.closedAt = closedAt
    self.closedBy = closedBy
  }
}
