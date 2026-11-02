import EchoDomain
import Foundation

extension EchoHomeClient {
  /// Searches messages in one conversation. The server owns visibility and
  /// ordering; the client only maps the wire rows into the native message model.
  public func searchMessages(
    accessToken: String,
    channelID: String,
    currentUserID: String?,
    query: String,
    before: String? = nil,
    limit: Int = 24,
    criteria: EchoMessageSearchCriteria = EchoMessageSearchCriteria()
  ) async throws -> EchoMessageSearchPage {
    try await performMessageSearch(
      path: "/channels/\(escaped(channelID))/messages/search",
      fallbackChannelID: channelID,
      accessToken: accessToken,
      currentUserID: currentUserID,
      query: query,
      before: before,
      limit: limit,
      criteria: criteria,
      includeChannelFilter: false
    )
  }

  /// Guild-wide search across accessible text channels (web `fetchEchoServerMessageSearch`).
  public func searchServerMessages(
    accessToken: String,
    serverID: String,
    currentUserID: String?,
    query: String,
    before: String? = nil,
    limit: Int = 24,
    criteria: EchoMessageSearchCriteria = EchoMessageSearchCriteria()
  ) async throws -> EchoMessageSearchPage {
    try await performMessageSearch(
      path: "/servers/\(escaped(serverID))/messages/search",
      fallbackChannelID: "",
      accessToken: accessToken,
      currentUserID: currentUserID,
      query: query,
      before: before,
      limit: limit,
      criteria: criteria,
      includeChannelFilter: true
    )
  }

  func performMessageSearch(
    path: String,
    fallbackChannelID: String,
    accessToken: String,
    currentUserID: String?,
    query: String,
    before: String?,
    limit: Int,
    criteria: EchoMessageSearchCriteria,
    includeChannelFilter: Bool
  ) async throws -> EchoMessageSearchPage {
    let pageLimit = min(max(limit, 1), 50)
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    var queryItems: [URLQueryItem] = [
      URLQueryItem(name: "limit", value: String(pageLimit))
    ]
    if !trimmedQuery.isEmpty {
      queryItems.append(URLQueryItem(name: "q", value: trimmedQuery))
    }
    if let before, !before.isEmpty {
      queryItems.append(URLQueryItem(name: "before", value: before))
    }
    if includeChannelFilter,
      let channelID = criteria.channelID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !channelID.isEmpty
    {
      queryItems.append(URLQueryItem(name: "channelId", value: channelID))
    }
    if let authorID = criteria.authorID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !authorID.isEmpty
    {
      queryItems.append(URLQueryItem(name: "authorId", value: authorID))
    }
    if let mentions = criteria.mentions?.trimmingCharacters(in: .whitespacesAndNewlines),
      !mentions.isEmpty
    {
      queryItems.append(URLQueryItem(name: "mentions", value: mentions))
    }
    if let hasType = criteria.hasType {
      queryItems.append(URLQueryItem(name: "hasType", value: hasType.rawValue))
    }
    if criteria.hasAttachment {
      queryItems.append(URLQueryItem(name: "hasAttachment", value: "1"))
    }
    let response: EchoHomeMessagesResponse = try await request(
      path: path,
      queryItems: queryItems,
      accessToken: accessToken
    )
    let messages = response.messages.compactMap {
      $0.message(channelID: fallbackChannelID, currentUserID: currentUserID)
    }
    return EchoMessageSearchPage(
      messages: messages,
      hasMoreBefore: response.messages.count >= pageLimit
    )
  }
}
