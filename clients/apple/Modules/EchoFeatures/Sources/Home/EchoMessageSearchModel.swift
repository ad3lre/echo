import EchoDomain
import EchoNetworking
import Foundation
import Observation

enum EchoMessageSearchAuthorScope: Equatable, Sendable {
  case anyone
  case me
  case peer
}

/// Owns query timing, filters, and pagination for conversation search.
@MainActor
@Observable
final class EchoMessageSearchModel {
  let conversation: EchoDirectMessage
  let baseURL: URL
  private let client: any EchoMessageSearchLoading
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String

  private(set) var results: [EchoMessage] = []
  private(set) var isSearching = false
  private(set) var isLoadingMore = false
  private(set) var hasMoreBefore = false
  private(set) var errorMessage: String?
  private(set) var activeQuery = ""

  var authorScope: EchoMessageSearchAuthorScope = .anyone
  var mentionsMe = false
  var hasType: EchoMessageSearchHasType?
  var hasAttachment = false

  @ObservationIgnored private var searchGeneration = 0

  init(
    conversation: EchoDirectMessage,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String,
    client: (any EchoMessageSearchLoading)? = nil
  ) {
    self.conversation = conversation
    self.baseURL = baseURL
    self.auth = auth
    self.userID = userID
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
  }

  var criteria: EchoMessageSearchCriteria {
    EchoMessageSearchCriteria(
      authorID: resolvedAuthorID,
      mentions: resolvedMentions,
      hasType: hasType,
      hasAttachment: hasAttachment
    )
  }

  var hasActiveCriteria: Bool { !criteria.isEmpty }

  var canSearch: Bool {
    !activeQuery.isEmpty || hasActiveCriteria
  }

  /// Replaces the result set for a new query/filter combination.
  func search(_ query: String) async {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    searchGeneration &+= 1
    let generation = searchGeneration
    activeQuery = trimmed
    results = []
    hasMoreBefore = false
    errorMessage = nil
    guard !trimmed.isEmpty || hasActiveCriteria else {
      isSearching = false
      return
    }

    isSearching = true
    defer {
      if generation == searchGeneration { isSearching = false }
    }
    do {
      let page = try await auth.withAccessTokenRetry { token in
        try await client.searchMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          query: trimmed,
          before: nil,
          limit: 24,
          criteria: criteria
        )
      }
      guard generation == searchGeneration else { return }
      results = page.messages
      hasMoreBefore = page.hasMoreBefore
    } catch {
      guard generation == searchGeneration else { return }
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func loadMore() async {
    guard !isSearching, !isLoadingMore, hasMoreBefore,
      let cursor = results.last?.id, canSearch
    else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await auth.withAccessTokenRetry { token in
        try await client.searchMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          query: activeQuery,
          before: cursor,
          limit: 24,
          criteria: criteria
        )
      }
      let existingIDs = Set(results.map(\.id))
      let additions = page.messages.filter { !existingIDs.contains($0.id) }
      results.append(contentsOf: additions)
      hasMoreBefore = page.hasMoreBefore && !additions.isEmpty
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func toggleHasType(_ type: EchoMessageSearchHasType) {
    hasType = hasType == type ? nil : type
    if hasType != nil { hasAttachment = false }
  }

  func toggleHasAttachment() {
    hasAttachment.toggle()
    if hasAttachment { hasType = nil }
  }

  func setAuthorScope(_ scope: EchoMessageSearchAuthorScope) {
    authorScope = authorScope == scope ? .anyone : scope
  }

  func toggleMentionsMe() {
    mentionsMe.toggle()
  }

  func clearFilters() {
    authorScope = .anyone
    mentionsMe = false
    hasType = nil
    hasAttachment = false
  }

  private var resolvedAuthorID: String? {
    switch authorScope {
    case .anyone: nil
    case .me: userID
    case .peer: conversation.peerUserID
    }
  }

  private var resolvedMentions: String? {
    guard mentionsMe else { return nil }
    let name =
      auth.activeSession?.username?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let name, !name.isEmpty { return name }
    return userID
  }
}
