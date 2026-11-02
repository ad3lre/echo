import EchoDomain
import EchoNetworking
import Foundation
import Observation

/// Guild-wide message search (`GET /servers/:id/messages/search`) — web members SearchBar.
@MainActor
@Observable
final class EchoServerMessageSearchModel {
  let server: EchoServerSummary
  let baseURL: URL
  private let client: any EchoServerMessageSearchLoading
  @ObservationIgnored var auth: EchoAuthenticationModel
  private let userID: String
  /// Text-like channels for `in:` name → id resolution and result labels.
  private(set) var channels: [EchoGuildChannel]
  /// Optional member directory for resolving `from:` to `authorId`.
  private(set) var members: [EchoServerMember]

  private(set) var results: [EchoMessage] = []
  private(set) var isSearching = false
  private(set) var isLoadingMore = false
  private(set) var hasMoreBefore = false
  private(set) var errorMessage: String?
  private(set) var activeQuery = ""

  var authorMeOnly = false
  var mentionsMe = false
  var hasType: EchoMessageSearchHasType?
  var hasAttachment = false
  var inlineMentions: String?
  var inlineAuthorID: String?
  var channelID: String?

  @ObservationIgnored private var searchGeneration = 0

  init(
    server: EchoServerSummary,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String,
    channels: [EchoGuildChannel] = [],
    members: [EchoServerMember] = [],
    client: (any EchoServerMessageSearchLoading)? = nil
  ) {
    self.server = server
    self.baseURL = baseURL
    self.auth = auth
    self.userID = userID
    self.channels = channels.filter(\.isTextLike)
    self.members = members
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
  }

  func updateDirectory(channels: [EchoGuildChannel], members: [EchoServerMember]) {
    self.channels = channels.filter(\.isTextLike)
    self.members = members
  }

  var criteria: EchoMessageSearchCriteria {
    EchoMessageSearchCriteria(
      authorID: resolvedAuthorID,
      mentions: resolvedMentions,
      hasType: hasType,
      hasAttachment: hasAttachment,
      channelID: channelID
    )
  }

  var hasActiveCriteria: Bool { !criteria.isEmpty }

  var canSearch: Bool {
    !activeQuery.isEmpty || hasActiveCriteria
  }

  func channelName(for channelID: String) -> String? {
    let trimmed = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return channels.first { $0.id == trimmed }?.name
  }

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
        try await client.searchServerMessages(
          accessToken: token,
          serverID: server.id,
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
        try await client.searchServerMessages(
          accessToken: token,
          serverID: server.id,
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

  func toggleAuthorMeOnly() {
    authorMeOnly.toggle()
    if authorMeOnly { inlineAuthorID = nil }
  }

  func toggleMentionsMe() {
    mentionsMe.toggle()
    if mentionsMe { inlineMentions = nil }
  }

  func clearFilters() {
    authorMeOnly = false
    mentionsMe = false
    hasType = nil
    hasAttachment = false
    inlineMentions = nil
    inlineAuthorID = nil
    channelID = nil
  }

  func applyInlineFilters(from raw: String) {
    let extracted = EchoMessageSearchInline.extract(raw)
    if let type = extracted.hasType {
      hasType = type
      hasAttachment = false
    }
    if let channelIn = extracted.channelIn {
      channelID = resolveChannelID(named: channelIn)
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
    if authorMeOnly { return userID }
    return inlineAuthorID
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

  private func resolveChannelID(named raw: String) -> String? {
    let needle = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return nil }
    if let exact = channels.first(where: { $0.id.lowercased() == needle }) {
      return exact.id
    }
    if let byName = channels.first(where: {
      $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == needle
    }) {
      return byName.id
    }
    return channels.first(where: {
      $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().contains(needle)
    })?.id
  }

  private func resolveFromToken(_ raw: String) {
    if identityMatchesViewer(raw) {
      authorMeOnly = true
      inlineAuthorID = nil
      return
    }
    authorMeOnly = false
    let needle = raw.lowercased()
    if let member = members.first(where: {
      EchoUserIdentity.matches($0.userID, needle)
        || $0.username?.lowercased() == needle
        || $0.name.lowercased() == needle
        || ($0.username?.lowercased().contains(needle) ?? false)
        || $0.name.lowercased().contains(needle)
    }) {
      inlineAuthorID = member.userID
      return
    }
    inlineAuthorID = raw
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
