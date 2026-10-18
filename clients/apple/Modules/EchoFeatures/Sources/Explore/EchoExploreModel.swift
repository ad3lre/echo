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
  private(set) var joiningIDs = Set<String>()

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
    quickFilters = EchoExploreDirectory.collectQuickFilters(from: listed)
    featured = EchoExploreDirectory.featured(listed)
    refreshResults()
  }

  private func refreshResults() {
    let filtered = EchoExploreDirectory.filter(
      rows: listed, query: searchQuery, selectedTag: selectedTag)
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

  func join(_ listed: EchoExploreDirectory.ListedServer) async -> Bool {
    let id = listed.id
    guard !joiningIDs.contains(id), !joinedIDs.contains(id) else { return false }
    joiningIDs.insert(id)
    defer { joiningIDs.remove(id) }
    do {
      let token = try await auth.ensureAccessToken()
      _ = try await client.joinDirectoryServer(serverID: id, accessToken: token)
      joinedIDs.insert(id)
      rebuildCatalog()
      return true
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t join that server.")
      return false
    }
  }
}
