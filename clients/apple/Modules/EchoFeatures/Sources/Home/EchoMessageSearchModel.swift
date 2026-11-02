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
  /// Free-form `mentions:` token when it does not resolve to the current user.
  var inlineMentions: String?

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
    applyInlineFilters(from: trimmed)
    let apiQuery = EchoMessageSearchInline.queryForAPI(trimmed)
    searchGeneration &+= 1
    let generation = searchGeneration
    activeQuery = apiQuery
    results = []
    isLoadingMore = false
    hasMoreBefore = false
    errorMessage = nil
    guard !apiQuery.isEmpty || hasActiveCriteria else {
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
          query: apiQuery,
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
    let generation = searchGeneration
    let query = activeQuery
    let filters = criteria
    isLoadingMore = true
    defer { if generation == searchGeneration { isLoadingMore = false } }
    do {
      let page = try await auth.withAccessTokenRetry { token in
        try await client.searchMessages(
          accessToken: token,
          channelID: conversation.channelID,
          currentUserID: userID,
          query: query,
          before: cursor,
          limit: 24,
          criteria: filters
        )
      }
      guard generation == searchGeneration, !Task.isCancelled else { return }
      let existingIDs = Set(results.map(\.id))
      let additions = page.messages.filter { !existingIDs.contains($0.id) }
      results.append(contentsOf: additions)
      hasMoreBefore = page.hasMoreBefore && !additions.isEmpty
    } catch {
      guard generation == searchGeneration, !Task.isCancelled else { return }
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
    inlineMentions = nil
  }

  /// Merge typed `from:` / `has:` / `mentions:` into chip state (web search controller).
  func applyInlineFilters(from raw: String) {
    let extracted = EchoMessageSearchInline.extract(raw)
    if let type = extracted.hasType {
      hasType = type
      hasAttachment = false
    }
    if let from = extracted.from {
      resolveFromToken(from)
    }
    if let mentions = extracted.mentions {
      if identityMatchesViewer(mentions) {
        mentionsMe = true
        inlineMentions = nil
      } else {
        mentionsMe = false
        inlineMentions = mentions
      }
    }
  }

  private var resolvedAuthorID: String? {
    switch authorScope {
    case .anyone: nil
    case .me: userID
    case .peer: conversation.peerUserID
    }
  }

  private var resolvedMentions: String? {
    if let inline = inlineMentions?.trimmingCharacters(in: .whitespacesAndNewlines),
      !inline.isEmpty
    {
      return inline
    }
    guard mentionsMe else { return nil }
    let name =
      auth.activeSession?.username?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let name, !name.isEmpty { return name }
    return userID
  }

  private func resolveFromToken(_ raw: String) {
    if identityMatchesViewer(raw) {
      authorScope = .me
      return
    }
    let needle = raw.lowercased()
    let peerName = conversation.displayName.lowercased()
    let peerUser = conversation.username?.lowercased() ?? ""
    let peerID = conversation.peerUserID?.lowercased() ?? ""
    if !peerID.isEmpty,
      peerName.contains(needle) || peerUser.contains(needle) || peerID == needle
        || peerUser == needle
    {
      authorScope = .peer
    }
  }

  private func identityMatchesViewer(_ raw: String) -> Bool {
    let needle = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return false }
    if EchoUserIdentity.matches(needle, userID) { return true }
    let username =
      auth.activeSession?.username?.trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased() ?? ""
    return !username.isEmpty && (username == needle || username.contains(needle))
  }
}
