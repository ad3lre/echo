import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
final class EchoServersModel {
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel
  private let stars = EchoStarredServersStore.shared
  private let mru = EchoServerMruStore.shared

  private(set) var servers: [EchoServerSummary] = []
  private(set) var channelsByServer: [String: [EchoGuildChannel]] = [:]
  private(set) var membersByServer: [String: [EchoServerMember]] = [:]
  private(set) var rolesByServer: [String: [EchoServerRole]] = [:]
  private(set) var assignmentsByServer: [String: [String: [String]]] = [:]
  private(set) var capabilitiesByServer: [String: EchoServerCapabilities] = [:]
  private(set) var isLoading = false
  private(set) var isLoadingChannels = false
  private(set) var isLoadingMembers = false
  private(set) var isRoleMutationBusy = false
  private(set) var errorMessage: String?
  private(set) var channelErrorMessage: String?
  private(set) var membersErrorMessage: String?
  private(set) var actionErrorMessage: String?
  private(set) var memberActionErrorMessage: String?

  /// Bumps when star / MRU order or role assignments change so views refresh.
  private(set) var starEpoch = 0
  private(set) var roleEpoch = 0

  init(baseURL: URL, auth: EchoAuthenticationModel) {
    self.client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
  }

  var currentUserID: String? {
    auth.activeSession?.userID
  }

  var orderedServers: [EchoServerSummary] {
    let _ = starEpoch
    var byID: [String: EchoServerSummary] = [:]
    byID.reserveCapacity(servers.count)
    for server in servers where byID[server.id] == nil {
      byID[server.id] = server
    }
    // Web `serverStore.servers` is API membership order (then optional saved
    // rail order). More Servers only floats pins — do not MRU-reshuffle the
    // iPhone list away from that real order.
    let orderedIDs = EchoServerListOrdering.orderedIDs(
      serverIDs: servers.map(\.id),
      pinnedIDs: stars.starredIDs,
      mruIDs: []
    )
    return orderedIDs.compactMap { byID[$0] }
  }

  func isStarred(_ serverID: String) -> Bool {
    let _ = starEpoch
    return stars.isStarred(serverID)
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
      let token = try await auth.ensureAccessToken()
      stars.activate(accountID: auth.activeSession?.userID)
      mru.activate(accountID: auth.activeSession?.userID)
      servers = try await client.loadServers(accessToken: token)
      mru.prune(toValidIDs: Set(servers.map(\.id)))
      starEpoch &+= 1
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load your servers.")
    }
  }

  func toggleStar(_ server: EchoServerSummary) {
    stars.activate(accountID: auth.activeSession?.userID)
    stars.toggle(server.id)
    starEpoch &+= 1
  }

  /// Record an open for last-visited / analytics — does not reorder the list.
  func noteOpened(_ server: EchoServerSummary) {
    mru.activate(accountID: auth.activeSession?.userID)
    mru.touch(server.id)
  }

  func clearActionError() {
    actionErrorMessage = nil
  }

  func clearMemberActionError() {
    memberActionErrorMessage = nil
  }

  func leave(_ server: EchoServerSummary) async {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.leaveServer(serverID: server.id, accessToken: token)
      servers.removeAll { $0.id == server.id }
      channelsByServer[server.id] = nil
      membersByServer[server.id] = nil
      rolesByServer[server.id] = nil
      assignmentsByServer[server.id] = nil
      capabilitiesByServer[server.id] = nil
      stars.remove(server.id)
      starEpoch &+= 1
    } catch {
      if let home = error as? EchoHomeClientError,
        case .server(_, let code, let message) = home
      {
        if code == "OWNER_CANNOT_LEAVE" || message?.localizedCaseInsensitiveContains("owner") == true
        {
          actionErrorMessage = EchoCopy.string(
            "Transfer ownership before leaving this server.")
          return
        }
      }
      actionErrorMessage = EchoCopy.string("Echo couldn’t leave that server.")
    }
  }

  func loadChannels(for serverID: String) async {
    isLoadingChannels = true
    channelErrorMessage = nil
    defer { isLoadingChannels = false }
    do {
      let token = try await auth.ensureAccessToken()
      channelsByServer[serverID] = try await client.loadChannels(
        serverID: serverID, accessToken: token)
    } catch {
      channelErrorMessage = EchoCopy.string("Echo couldn’t load channels.")
    }
  }

  func channels(for serverID: String) -> [EchoGuildChannel] {
    channelsByServer[serverID] ?? []
  }

  func loadMembers(for serverID: String) async {
    isLoadingMembers = true
    membersErrorMessage = nil
    defer { isLoadingMembers = false }
    do {
      let token = try await auth.ensureAccessToken()
      async let membersTask = client.loadMembers(serverID: serverID, accessToken: token)
      async let bootstrapTask = client.loadRoleUiBootstrap(
        serverID: serverID, accessToken: token)
      let members = try await membersTask
      membersByServer[serverID] = members
      if let bootstrap = try? await bootstrapTask {
        rolesByServer[serverID] = bootstrap.roles
        assignmentsByServer[serverID] = bootstrap.assignments
        capabilitiesByServer[serverID] = bootstrap.capabilities
      } else {
        rolesByServer[serverID] = rolesByServer[serverID] ?? []
        assignmentsByServer[serverID] = assignmentsByServer[serverID] ?? [:]
        capabilitiesByServer[serverID] =
          capabilitiesByServer[serverID] ?? EchoServerCapabilities.none
      }
      roleEpoch &+= 1
    } catch {
      membersErrorMessage = EchoCopy.string("Echo couldn’t load members.")
    }
  }

  func members(for serverID: String) -> [EchoServerMember] {
    membersByServer[serverID] ?? []
  }

  func roles(for serverID: String) -> [EchoServerRole] {
    let _ = roleEpoch
    return rolesByServer[serverID] ?? []
  }

  func assignments(for serverID: String) -> [String: [String]] {
    let _ = roleEpoch
    return assignmentsByServer[serverID] ?? [:]
  }

  func capabilities(for serverID: String) -> EchoServerCapabilities {
    let _ = roleEpoch
    return capabilitiesByServer[serverID] ?? .none
  }

  func roleIDs(for serverID: String, userID: String) -> [String] {
    assignments(for: serverID)[userID] ?? []
  }

  func memberSections(
    for serverID: String, preferLight: Bool, hideGuests: Bool = true
  ) -> [EchoMemberListSection] {
    EchoMemberListSection.buildSections(
      members: members(for: serverID),
      catalog: roles(for: serverID),
      assignments: assignments(for: serverID),
      preferLight: preferLight,
      hideGuests: hideGuests
    )
  }

  func displayedRoles(for serverID: String, userID: String, preferLight: Bool)
    -> [EchoServerRole]
  {
    let ids = Set(roleIDs(for: serverID, userID: userID))
    return roles(for: serverID)
      .filter { ids.contains($0.id) && !$0.isEveryone }
      .sorted { $0.position > $1.position }
  }

  func canManageRolesUI(for serverID: String) -> Bool {
    capabilities(for: serverID).canManageRoles && !roles(for: serverID).isEmpty
  }

  func canMutateRole(
    server: EchoServerSummary, targetUserID: String, roleID: String, assign: Bool
  ) -> Bool {
    guard canManageRolesUI(for: server.id), let actor = currentUserID else { return false }
    let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return EchoMemberRoleMutateGate.canMutate(
      assign: assign,
      actorUserID: actor,
      targetUserID: targetUserID,
      roleID: roleID,
      actorIsServerOwner: !owner.isEmpty && owner == actor,
      targetIsServerOwner: !owner.isEmpty && owner == targetUserID,
      catalog: roles(for: server.id),
      assignments: assignments(for: server.id)
    )
  }

  func canKick(_ server: EchoServerSummary, targetUserID: String) -> Bool {
    guard let actor = currentUserID, actor != targetUserID else { return false }
    let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !owner.isEmpty && targetUserID == owner { return false }
    return capabilities(for: server.id).canKickMembers
  }

  func canBan(_ server: EchoServerSummary, targetUserID: String) -> Bool {
    guard let actor = currentUserID, actor != targetUserID else { return false }
    let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !owner.isEmpty && targetUserID == owner { return false }
    return capabilities(for: server.id).canBanMembers
  }

  func canTimeout(_ server: EchoServerSummary, targetUserID: String) -> Bool {
    guard let actor = currentUserID, actor != targetUserID else { return false }
    let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !owner.isEmpty && targetUserID == owner { return false }
    return capabilities(for: server.id).canTimeoutMembers
  }

  func toggleRole(
    server: EchoServerSummary, targetUserID: String, roleID: String, assign: Bool
  ) async {
    guard !isRoleMutationBusy else { return }
    guard canMutateRole(
      server: server, targetUserID: targetUserID, roleID: roleID, assign: assign)
    else { return }
    isRoleMutationBusy = true
    memberActionErrorMessage = nil
    // Optimistic local update first — keeps the role sheet stable if the
    // network round-trip or a later catalog refresh is noisy.
    var map = assignmentsByServer[server.id] ?? [:]
    var set = Set(map[targetUserID] ?? [])
    let previous = set
    if assign { set.insert(roleID) } else { set.remove(roleID) }
    map[targetUserID] = Array(set)
    assignmentsByServer[server.id] = map
    roleEpoch &+= 1
    defer { isRoleMutationBusy = false }
    do {
      let token = try await auth.ensureAccessToken()
      if assign {
        try await client.assignMemberRole(
          serverID: server.id, userID: targetUserID, roleID: roleID, accessToken: token)
      } else {
        try await client.removeMemberRole(
          serverID: server.id, userID: targetUserID, roleID: roleID, accessToken: token)
      }
    } catch {
      map[targetUserID] = Array(previous)
      assignmentsByServer[server.id] = map
      roleEpoch &+= 1
      memberActionErrorMessage = EchoCopy.string("Echo couldn’t update that role.")
    }
  }

  func kick(server: EchoServerSummary, member: EchoServerMember) async {
    await moderate(server: server, member: member, action: "kick")
  }

  func ban(server: EchoServerSummary, member: EchoServerMember) async {
    await moderate(server: server, member: member, action: "ban")
  }

  func timeout(server: EchoServerSummary, member: EchoServerMember, minutes: Int = 60) async {
    await moderate(
      server: server, member: member, action: "timeout",
      meta: ["timeoutMinutes": "\(minutes)"])
  }

  private func moderate(
    server: EchoServerSummary,
    member: EchoServerMember,
    action: String,
    meta: [String: String]? = nil
  ) async {
    memberActionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.moderateMember(
        serverID: server.id,
        action: action,
        targetUserID: member.userID,
        accessToken: token,
        meta: meta
      )
      if action == "kick" || action == "ban" {
        membersByServer[server.id]?.removeAll { $0.userID == member.userID }
        var map = assignmentsByServer[server.id] ?? [:]
        map[member.userID] = nil
        assignmentsByServer[server.id] = map
        roleEpoch &+= 1
      } else {
        await loadMembers(for: server.id)
      }
    } catch {
      memberActionErrorMessage = EchoCopy.string("Echo couldn’t complete that moderation action.")
    }
  }
}
