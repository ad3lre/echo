import EchoDomain
import Foundation

extension EchoServersModel {
  func canChangeNickname(_ server: EchoServerSummary, targetUserID: String) -> Bool {
    let caps = capabilities(for: server.id)
    if EchoUserIdentity.matches(currentUserID, targetUserID) {
      return caps.canChangeNicknames || caps.canManageNicknames
    }
    return caps.canManageNicknames
  }

  func setNickname(
    server: EchoServerSummary, member: EchoServerMember, nickname: String
  ) async {
    memberActionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.setMemberNickname(
        serverID: server.id, userID: member.userID, nickname: nickname, accessToken: token)
      await loadMembers(for: server.id)
    } catch {
      memberActionErrorMessage = EchoCopy.string("Echo couldn’t update that nickname.")
    }
  }

  func canManageChannel(_ channelID: String, server: EchoServerSummary) -> Bool {
    if capabilities(for: server.id).canManageServer { return true }
    return channelCapabilities[channelID]?.canManageChannel == true
  }

  func refreshChannelCapabilities(channelID: String) async {
    do {
      let token = try await auth.ensureAccessToken()
      channelCapabilities[channelID] = try await client.loadChannelCapabilities(
        channelID: channelID, accessToken: token)
    } catch {
      channelCapabilities[channelID] = nil
    }
  }

  func updateChannel(
    _ channel: EchoGuildChannel,
    server: EchoServerSummary,
    patch: EchoChannelPatch
  ) async -> Bool {
    actionErrorMessage = nil
    if let name = patch.name,
      name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      actionErrorMessage = EchoCopy.string("Enter a channel name.")
      return false
    }
    guard !patch.isEmpty else { return true }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.patchChannel(channelID: channel.id, patch: patch, accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t update that channel."))
      return false
    }
  }

  func deleteChannel(_ channel: EchoGuildChannel, server: EchoServerSummary) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.deleteChannel(channelID: channel.id, accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t delete that channel.")
      return false
    }
  }

  func loadOverwrites(channelID: String) async -> [EchoPermissionOverwrite]? {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadPermissionOverwrites(
        channelID: channelID, accessToken: token)
    } catch {
      return nil
    }
  }

  /// Returns `nil` on failure, otherwise the allow bits the server stripped.
  func saveOverwrites(channelID: String, rows: [EchoPermissionOverwrite]) async -> [String]? {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.savePermissionOverwrites(
        channelID: channelID, rows: rows, accessToken: token)
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save those permissions."))
      return nil
    }
  }

  // MARK: - Categories

  func canManageCategories(_ server: EchoServerSummary) -> Bool {
    let caps = capabilities(for: server.id)
    return caps.canCreateChannel || caps.canManageServer
  }

  func loadCategories(for server: EchoServerSummary) async -> [EchoGuildCategory] {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadCategories(serverID: server.id, accessToken: token)
    } catch {
      return []
    }
  }

  func updateCategory(
    _ categoryID: String,
    server: EchoServerSummary,
    name: String?,
    autoDelete: EchoPatchValue<Int>?
  ) async -> Bool {
    actionErrorMessage = nil
    if let name, name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      actionErrorMessage = EchoCopy.string("Enter a category name.")
      return false
    }
    guard name != nil || autoDelete != nil else { return true }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.patchCategory(
        serverID: server.id, categoryID: categoryID,
        name: name?.trimmingCharacters(in: .whitespacesAndNewlines),
        autoDeleteAfterSeconds: autoDelete, accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t update that category."))
      return false
    }
  }

  func deleteCategory(_ categoryID: String, server: EchoServerSummary) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.deleteCategory(
        serverID: server.id, categoryID: categoryID, accessToken: token)
      await loadChannels(for: server.id)
      return true
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t delete that category."))
      return false
    }
  }

  func loadCategoryOverwrites(
    _ categoryID: String, server: EchoServerSummary
  ) async -> [EchoPermissionOverwrite]? {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadCategoryPermissionOverwrites(
        serverID: server.id, categoryID: categoryID, accessToken: token)
    } catch {
      return nil
    }
  }

  /// Returns `nil` on failure, otherwise the allow bits the server stripped.
  func saveCategoryOverwrites(
    _ categoryID: String, server: EchoServerSummary, rows: [EchoPermissionOverwrite]
  ) async -> [String]? {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      let stripped = try await client.saveCategoryPermissionOverwrites(
        serverID: server.id, categoryID: categoryID, rows: rows, accessToken: token)
      await loadChannels(for: server.id)
      return stripped
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save those permissions."))
      return nil
    }
  }

  func loadNotificationLevel(for server: EchoServerSummary) async -> String {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadServerNotificationLevel(
        serverID: server.id, accessToken: token)
    } catch {
      return "mentions"
    }
  }

  func saveNotificationLevel(_ level: String, for server: EchoServerSummary) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.saveServerNotificationLevel(
        serverID: server.id, level: level, accessToken: token)
      // Keep guild banner + incoming-sound prefs in sync without waiting on debounce alone.
      await EchoAttentionSync.shared.refresh(auth: auth)
      return true
    } catch {
      actionErrorMessage = EchoCopy.string("Echo couldn’t save notification settings.")
      return false
    }
  }
}
