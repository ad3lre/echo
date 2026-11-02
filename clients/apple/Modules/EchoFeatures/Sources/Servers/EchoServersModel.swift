import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
final class EchoServersModel {
  let client: EchoWorkspaceClient
  let auth: EchoAuthenticationModel
  private let stars = EchoStarredServersStore.shared
  private let mru = EchoServerMruStore.shared

  private(set) var servers: [EchoServerSummary] = []
  private(set) var channelsByServer: [String: [EchoGuildChannel]] = [:]
  /// Discord display-only occupants keyed by Echo channel id (`discord_voice_mirror_roster`).
  private(set) var discordVoiceMirrorRosterByChannelID: [String: [EchoDiscordVoiceMirrorMember]] =
    [:]

  func replaceChannels(_ channels: [EchoGuildChannel], for serverID: String) {
    channelsByServer[serverID] = channels
  }

  func mergeDiscordVoiceMirror(_ rows: [EchoDiscordVoiceMirrorChannelRoster]) {
    guard !rows.isEmpty else { return }
    var next = discordVoiceMirrorRosterByChannelID
    for row in rows {
      next[row.echoChannelID] = row.members
    }
    discordVoiceMirrorRosterByChannelID = next
  }

  func discordMirrorMembers(for channelID: String) -> [EchoDiscordVoiceMirrorMember] {
    discordVoiceMirrorRosterByChannelID[channelID] ?? []
  }
  private(set) var membersByServer: [String: [EchoServerMember]] = [:]
  private(set) var rolesByServer: [String: [EchoServerRole]] = [:]
  private(set) var assignmentsByServer: [String: [String: [String]]] = [:]
  private(set) var capabilitiesByServer: [String: EchoServerCapabilities] = [:]
  var channelCapabilities: [String: EchoChannelCapabilities] = [:]
  private(set) var isLoading = false
  private(set) var isLoadingChannels = false
  private(set) var isLoadingMembers = false
  private(set) var isRoleMutationBusy = false
  private(set) var errorMessage: String?
  private(set) var channelErrorMessage: String?
  private(set) var membersErrorMessage: String?
  var actionErrorMessage: String?
  var memberActionErrorMessage: String?

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
        if code == "OWNER_CANNOT_LEAVE"
          || message?.localizedCaseInsensitiveContains("owner") == true
        {
          actionErrorMessage = EchoCopy.string(
            "Transfer ownership before leaving this server.")
          return
        }
      }
      actionErrorMessage = EchoCopy.string("Echo couldn’t leave that server.")
    }
  }

  func updateOverview(_ server: EchoServerSummary, name: String, description: String) async -> Bool
  {
    await patchPreferences(
      server,
      EchoServerPreferencesPatch(name: name, description: description),
      requireNonEmptyName: true
    )
  }

  @discardableResult
  func patchPreferences(
    _ server: EchoServerSummary,
    _ patch: EchoServerPreferencesPatch,
    requireNonEmptyName: Bool = false
  ) async -> Bool {
    actionErrorMessage = nil
    if requireNonEmptyName {
      let trimmedName = (patch.name ?? server.name).trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmedName.isEmpty else {
        actionErrorMessage = EchoCopy.string("Enter a server name.")
        return false
      }
    }
    var normalized = patch
    if let name = patch.name {
      normalized.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.patchServerPreferences(
        serverID: server.id, patch: normalized, accessToken: token)
      if let index = servers.firstIndex(where: { $0.id == server.id }) {
        servers[index] = Self.applying(normalized, to: servers[index])
      }
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t save server settings.")
      return false
    }
  }

  func transferOwnership(_ server: EchoServerSummary, to newOwnerID: String) async -> Bool {
    actionErrorMessage = nil
    let trimmed = newOwnerID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      actionErrorMessage = EchoCopy.string("Pick a member to transfer ownership to.")
      return false
    }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.transferServerOwnership(
        serverID: server.id, newOwnerID: trimmed, accessToken: token)
      if let index = servers.firstIndex(where: { $0.id == server.id }) {
        let current = servers[index]
        servers[index] = EchoServerSummary(
          id: current.id,
          name: current.name,
          iconURL: current.iconURL,
          bannerURL: current.bannerURL,
          description: current.description,
          ownerID: trimmed,
          vanityCode: current.vanityCode,
          tags: current.tags,
          listedInDirectory: current.listedInDirectory,
          inviteJoinEnabled: current.inviteJoinEnabled,
          bannerBlurEnabled: current.bannerBlurEnabled,
          bannerBlackoutEnabled: current.bannerBlackoutEnabled,
          bannerPositionY: current.bannerPositionY,
          automodSpamEnabled: current.automodSpamEnabled,
          raidProtectionEnabled: current.raidProtectionEnabled,
          raidJoinThresholdCount: current.raidJoinThresholdCount,
          raidJoinWindowSeconds: current.raidJoinWindowSeconds,
          applicationsEnabled: current.applicationsEnabled,
          allowGlobalGuests: current.allowGlobalGuests,
          verificationRequireEmail: current.verificationRequireEmail,
          welcomeChannelID: current.welcomeChannelID,
          discordGuildID: current.discordGuildID
        )
      }
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t transfer ownership.")
      return false
    }
  }

  func createRole(
    _ server: EchoServerSummary, name: String, color: String = "#94a3b8"
  ) async -> String? {
    actionErrorMessage = nil
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      actionErrorMessage = EchoCopy.string("Enter a role name.")
      return nil
    }
    do {
      let token = try await auth.ensureAccessToken()
      let roleID = try await client.createRole(
        serverID: server.id, name: trimmed, color: color, accessToken: token)
      await loadMembers(for: server.id)
      return roleID
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t create that role.")
      return nil
    }
  }

  func updateRole(
    _ server: EchoServerSummary,
    roleID: String,
    name: String? = nil,
    color: String? = nil,
    permissions: [String]? = nil,
    hoist: Bool? = nil,
    roleIcon: EchoRoleIconPatch? = nil
  ) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.patchRole(
        serverID: server.id,
        roleID: roleID,
        name: name,
        color: color,
        permissions: permissions,
        hoist: hoist,
        roleIcon: roleIcon,
        accessToken: token
      )
      await loadMembers(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t save that role.")
      return false
    }
  }

  func deleteRole(_ server: EchoServerSummary, roleID: String) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.deleteRole(serverID: server.id, roleID: roleID, accessToken: token)
      await loadMembers(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t delete that role.")
      return false
    }
  }

  func reorderRoles(_ server: EchoServerSummary, roleIDs: [String]) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.reorderRoles(
        serverID: server.id, roleIDs: roleIDs, accessToken: token)
      await loadMembers(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t reorder roles.")
      return false
    }
  }

  private static func applying(
    _ patch: EchoServerPreferencesPatch, to server: EchoServerSummary
  ) -> EchoServerSummary {
    EchoServerSummary(
      id: server.id,
      name: patch.name ?? server.name,
      iconURL: patch.iconURL ?? server.iconURL,
      bannerURL: patch.bannerURL ?? server.bannerURL,
      description: patch.description ?? server.description,
      ownerID: server.ownerID,
      vanityCode: patch.vanityCode ?? server.vanityCode,
      tags: patch.tags ?? server.tags,
      listedInDirectory: patch.listedInDirectory ?? server.listedInDirectory,
      inviteJoinEnabled: patch.inviteJoinEnabled ?? server.inviteJoinEnabled,
      bannerBlurEnabled: patch.bannerBlurEnabled ?? server.bannerBlurEnabled,
      bannerBlackoutEnabled: patch.bannerBlackoutEnabled ?? server.bannerBlackoutEnabled,
      bannerPositionY: patch.bannerPositionY ?? server.bannerPositionY,
      automodSpamEnabled: patch.automodSpamEnabled ?? server.automodSpamEnabled,
      raidProtectionEnabled: patch.raidProtectionEnabled ?? server.raidProtectionEnabled,
      raidJoinThresholdCount: patch.raidJoinThresholdCount ?? server.raidJoinThresholdCount,
      raidJoinWindowSeconds: patch.raidJoinWindowSeconds ?? server.raidJoinWindowSeconds,
      applicationsEnabled: patch.applicationsEnabled ?? server.applicationsEnabled,
      allowGlobalGuests: patch.allowGlobalGuests ?? server.allowGlobalGuests,
      verificationRequireEmail: patch.verificationRequireEmail
        ?? server.verificationRequireEmail,
      welcomeChannelID: patch.clearWelcomeChannel
        ? nil : (patch.welcomeChannelID ?? server.welcomeChannelID),
      discordGuildID: server.discordGuildID
    )
  }

  func delete(_ server: EchoServerSummary) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.deleteServer(serverID: server.id, accessToken: token)
      servers.removeAll { $0.id == server.id }
      channelsByServer[server.id] = nil
      membersByServer[server.id] = nil
      rolesByServer[server.id] = nil
      assignmentsByServer[server.id] = nil
      capabilitiesByServer[server.id] = nil
      stars.remove(server.id)
      starEpoch &+= 1
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t delete that server.")
      return false
    }
  }

  func createChannel(
    _ server: EchoServerSummary, name: String, type: String, categoryID: String
  ) async -> Bool {
    actionErrorMessage = nil
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      actionErrorMessage = EchoCopy.string("Enter a channel name.")
      return false
    }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.createChannel(
        serverID: server.id, name: trimmed, type: type, categoryID: categoryID,
        accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t create that channel.")
      return false
    }
  }

  func createCategory(_ server: EchoServerSummary, name: String) async -> Bool {
    actionErrorMessage = nil
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      actionErrorMessage = EchoCopy.string("Enter a category name.")
      return false
    }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.createCategory(
        serverID: server.id, name: trimmed, accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t create that category.")
      return false
    }
  }

  func inviteURL(for server: EchoServerSummary) async -> String? {
    do {
      let token = try await auth.ensureAccessToken()
      if let url = try? await client.fetchServerInviteLink(
        serverID: server.id, accessToken: token)
      {
        return url
      }
      return try await client.createServerInvite(serverID: server.id, accessToken: token)
    } catch {
      return nil
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
    guard
      canMutateRole(
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

  /// Drop local roster/assignments after a successful kick or ban (same-module extensions).
  func removeMemberAfterKickOrBan(serverID: String, userID: String) {
    membersByServer[serverID]?.removeAll { $0.userID == userID }
    var map = assignmentsByServer[serverID] ?? [:]
    map[userID] = nil
    assignmentsByServer[serverID] = map
    roleEpoch &+= 1
  }
}
