import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
final class EchoExploreModel {
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var servers: [EchoDirectoryServer] = []
  private(set) var joinedIDs = Set<String>()
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  /// Join failures (shown even when the directory list is already loaded).
  private(set) var joinErrorMessage: String?
  private(set) var joiningIDs = Set<String>()
  /// Non-error status (e.g. application submitted) shown in the Explore banner.
  private(set) var noticeMessage: String?
  /// Set when a join returned `APPLICATION_REQUIRED`; Explore presents the form.
  var applicationContext: EchoJoinApplicationContext?

  var searchQuery = "" {
    didSet { if searchQuery != oldValue { refreshResults() } }
  }
  var sortMode: EchoExploreDirectory.SortMode = .recommended {
    didSet { if sortMode != oldValue { refreshResults() } }
  }
  var selectedTag: String? = nil {
    didSet { if selectedTag != oldValue { refreshResults() } }
  }
  var alphabeticalDescending = false {
    didSet { if alphabeticalDescending != oldValue { refreshResults() } }
  }
  var filtersExpanded = false
  /// How many sorted results to show (pageSize increments).
  var visibleCount = EchoExploreDirectory.pageSize {
    didSet { if visibleCount != oldValue { refreshVisible() } }
  }

  // Derived lists are cached: body reads them many times per pass, and
  // re-deriving/sorting on every read was the Explore open hitch.
  private(set) var listed: [EchoExploreDirectory.ListedServer] = []
  private(set) var quickFilters: [EchoExploreDirectory.QuickFilter] = []
  private(set) var featured: [EchoExploreDirectory.ListedServer] = []
  private(set) var sorted: [EchoExploreDirectory.ListedServer] = []
  private(set) var visibleServers: [EchoExploreDirectory.ListedServer] = []

  init(baseURL: URL, auth: EchoAuthenticationModel) {
    self.client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
  }

  var canLoadMore: Bool { visibleCount < sorted.count }

  var resultCountLabel: String {
    let n = sorted.count
    if n == 1 { return EchoCopy.string("1 result") }
    return EchoCopy.format("%lld results", Int64(n))
  }

  private func rebuildCatalog() {
    listed = EchoExploreDirectory.listedServers(from: servers, joinedIDs: joinedIDs)
    refreshResults()
  }

  private func refreshResults() {
    // Tag chips count against the search-matched set (not the selected tag), so
    // bubbles with zero hits disappear while typing.
    let searchMatched = EchoExploreDirectory.filter(
      rows: listed, query: searchQuery, selectedTag: nil)
    quickFilters = EchoExploreDirectory.collectQuickFilters(from: searchMatched)
    if let tag = selectedTag,
      !quickFilters.contains(where: { $0.tag == tag })
    {
      selectedTag = nil
      return
    }

    let filtered = EchoExploreDirectory.filter(
      rows: listed, query: searchQuery, selectedTag: selectedTag)
    // Featured follows the same search/tag filters; empty → section hides in the view.
    featured = EchoExploreDirectory.featured(filtered)
    sorted = EchoExploreDirectory.sort(
      filtered,
      mode: sortMode,
      alphabeticalDescending: alphabeticalDescending,
      catalogCount: listed.count
    )
    refreshVisible()
  }

  private func refreshVisible() {
    visibleServers = Array(sorted.prefix(max(0, visibleCount)))
  }

  func loadIfNeeded() async {
    guard servers.isEmpty else { return }
    await reload()
  }

  func reload() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      // Directory is public — fetch it in parallel with membership, don’t serialize.
      async let directory = client.loadDirectoryServers()
      async let membership = loadJoinedIDs()
      let rows = try await directory
      let joined = await membership
      servers = rows
      joinedIDs = joined.union(joinedIDs)
      visibleCount = EchoExploreDirectory.pageSize
      rebuildCatalog()
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load Explore.")
    }
  }

  private func loadJoinedIDs() async -> Set<String> {
    guard let token = try? await auth.ensureAccessToken() else { return [] }
    let joined = (try? await client.loadServers(accessToken: token)) ?? []
    return Set(joined.map(\.id))
  }

  func resetPaging() {
    visibleCount = EchoExploreDirectory.pageSize
  }

  func loadMore() {
    visibleCount = min(sorted.count, visibleCount + EchoExploreDirectory.pageSize)
  }

  func toggleTag(_ tag: String) {
    let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    selectedTag = selectedTag == normalized ? nil : normalized
    resetPaging()
  }

  func clearFilters() {
    searchQuery = ""
    selectedTag = nil
    resetPaging()
  }

  func setSort(_ mode: EchoExploreDirectory.SortMode) {
    if mode == .alphabetical, sortMode != .alphabetical {
      alphabeticalDescending = false
    }
    sortMode = mode
    resetPaging()
  }

  func clearJoinError() {
    joinErrorMessage = nil
    noticeMessage = nil
  }

  func joinInvite(_ raw: String) async -> String? {
    joinErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      let id = try await client.joinWithInvite(code: raw, accessToken: token)
      joinedIDs.insert(id)
      rebuildCatalog()
      return id
    } catch {
      if (error as? EchoHomeClientError)?.isApplicationRequired == true,
        let context = await client.loadInviteApplicationContext(
          inviteToken: EchoWorkspaceClient.inviteToken(from: raw))
      {
        applicationContext = context
        return nil
      }
      joinErrorMessage = EchoCopy.string("Echo couldn’t join that server. Tap Join to try again.")
      return nil
    }
  }

  func join(_ listed: EchoExploreDirectory.ListedServer) async -> Bool {
    let id = listed.id
    guard !joiningIDs.contains(id) else { return false }
    if joinedIDs.contains(id) { return true }
    joiningIDs.insert(id)
    joinErrorMessage = nil
    defer { joiningIDs.remove(id) }
    do {
      let token = try await auth.ensureAccessToken()
      _ = try await client.joinDirectoryServer(serverID: id, accessToken: token)
      joinedIDs.insert(id)
      rebuildCatalog()
      return true
    } catch {
      if (error as? EchoHomeClientError)?.isApplicationRequired == true,
        await presentDirectoryApplication(listed)
      {
        return false
      }
      joinErrorMessage = EchoCopy.string("Echo couldn’t join that server. Tap Join to try again.")
      return false
    }
  }

  // MARK: - Applications + create

  private func presentDirectoryApplication(
    _ listed: EchoExploreDirectory.ListedServer
  ) async -> Bool {
    guard let token = try? await auth.ensureAccessToken(),
      let form = try? await client.loadJoinApplicationForm(serverID: listed.id, accessToken: token)
    else { return false }
    applicationContext = EchoJoinApplicationContext(
      serverID: listed.id, serverName: listed.server.name, iconURL: listed.server.iconURL,
      source: .directory, inviteToken: nil, form: form)
    return true
  }

  /// Returns `nil` on success, otherwise a message to show inside the modal.
  func submitApplication(
    _ context: EchoJoinApplicationContext, answers: [String: EchoApplicationAnswer]
  ) async -> String? {
    do {
      let token = try await auth.ensureAccessToken()
      try await client.submitApplication(
        serverID: context.serverID, source: context.source, inviteToken: context.inviteToken,
        answers: answers, accessToken: token)
      applicationContext = nil
      noticeMessage = EchoCopy.string(
        "Application sent. You’ll get access if a moderator approves it.")
      return nil
    } catch {
      return echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t send your application."))
    }
  }

  /// Uploads a file answer for the join form; throws so the modal can show the message inline.
  func uploadApplicationFile(
    _ context: EchoJoinApplicationContext, question: EchoApplicationQuestion,
    file: EchoPickedFile
  ) async throws -> EchoApplicationUpload {
    let token = try await auth.ensureAccessToken()
    return try await client.uploadApplicationAttachment(
      serverID: context.serverID, data: file.data, filename: file.filename,
      mimeType: file.mimeType, maxBytes: question.maxBytes, accessToken: token)
  }

  /// `POST /servers` then (optionally) sets the icon, matching web create + branding patch.
  func createServer(name: String, iconData: Data?) async -> (id: String?, error: String?) {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return (nil, EchoCopy.string("Enter a server name.")) }
    do {
      let token = try await auth.ensureAccessToken()
      let created = try await client.createServer(name: trimmed, accessToken: token)
      if let iconData {
        try? await client.patchServerPreferences(
          serverID: created.serverID,
          patch: EchoServerPreferencesPatch(
            iconURL: "data:image/png;base64,\(iconData.base64EncodedString())"),
          accessToken: token)
      }
      joinedIDs.insert(created.serverID)
      return (created.serverID, nil)
    } catch {
      return (
        nil,
        echoSettingsErrorMessage(
          error, fallback: EchoCopy.string("Echo couldn’t create that server."))
      )
    }
  }
}
