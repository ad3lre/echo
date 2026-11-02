import EchoDomain
import EchoNetworking
import Foundation

/// Server-rail “Mark as read” planner (web `buildEchoServerMarkReadPlan`).
enum EchoServerMarkRead {
  struct Target: Equatable, Sendable {
    let channelID: String
    let lastReadMessageID: String
  }

  struct Plan: Equatable, Sendable {
    var targets: [Target]
    var channelIDsMissingLatestUnread: [String]

    var isEmpty: Bool {
      targets.isEmpty && channelIDsMissingLatestUnread.isEmpty
    }
  }

  enum Result: Equatable, Sendable {
    case ok
    case empty
    case failed
    case unauthenticated
  }

  static func plan(
    serverID: String,
    channelAttention: [String: EchoAttentionChannelSummary],
    ignoreLocalCursor: Bool = true
  ) -> Plan {
    let sid = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return Plan(targets: [], channelIDsMissingLatestUnread: []) }

    var targets: [Target] = []
    var missing: [String] = []
    for summary in channelAttention.values {
      let kind = summary.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard kind == "server",
        (summary.serverID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "") == sid,
        summary.unreadCount > 0
      else { continue }

      appendUnreadTarget(
        summary, ignoreLocalCursor: ignoreLocalCursor, targets: &targets, missing: &missing)
    }
    return Plan(targets: targets, channelIDsMissingLatestUnread: missing)
  }

  /// Messages-rail bulk read (web `buildEchoDmMarkReadPlan`).
  static func planAllDMs(
    channelAttention: [String: EchoAttentionChannelSummary],
    ignoreLocalCursor: Bool = true
  ) -> Plan {
    var targets: [Target] = []
    var missing: [String] = []
    for summary in channelAttention.values {
      let kind = summary.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard kind == "dm", summary.unreadCount > 0 else { continue }
      appendUnreadTarget(
        summary, ignoreLocalCursor: ignoreLocalCursor, targets: &targets, missing: &missing)
    }
    return Plan(targets: targets, channelIDsMissingLatestUnread: missing)
  }

  private static func appendUnreadTarget(
    _ summary: EchoAttentionChannelSummary,
    ignoreLocalCursor: Bool,
    targets: inout [Target],
    missing: inout [String]
  ) {
    guard let markTarget = summary.unreadUpperBoundMessageID else {
      missing.append(summary.channelID)
      return
    }
    if !ignoreLocalCursor {
      let cursor =
        summary.lastReadMessageID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !cursor.isEmpty, cursor == markTarget { return }
    }
    targets.append(Target(channelID: summary.channelID, lastReadMessageID: markTarget))
  }

  /// Execute plan: resolve missing anchors via latest message, PUT read-state, refresh attention.
  @MainActor
  static func execute(
    _ plan: Plan,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String
  ) async -> Result {
    guard let token = try? await auth.ensureAccessToken() else { return .unauthenticated }
    let client = EchoHomeClient(baseURL: baseURL)
    var targets = plan.targets
    var unresolved = 0

    for channelID in plan.channelIDsMissingLatestUnread {
      if let latest = await latestMessageID(
        client: client, token: token, channelID: channelID, userID: userID)
      {
        targets.append(Target(channelID: channelID, lastReadMessageID: latest))
      } else {
        unresolved += 1
      }
    }

    if targets.isEmpty {
      return unresolved > 0 ? .failed : .empty
    }

    var wrote = 0
    for target in targets {
      do {
        try await client.markChannelRead(
          accessToken: token,
          channelID: target.channelID,
          lastReadMessageID: target.lastReadMessageID)
        wrote += 1
      } catch {
        continue
      }
    }
    await EchoAttentionSync.shared.refresh(auth: auth)
    if wrote == 0 { return .failed }
    return .ok
  }

  @MainActor
  static func markServer(
    serverID: String,
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String
  ) async -> Result {
    let built = plan(
      serverID: serverID,
      channelAttention: EchoAttentionSync.shared.snapshot.channelAttention,
      ignoreLocalCursor: true)
    return await execute(built, baseURL: baseURL, auth: auth, userID: userID)
  }

  @MainActor
  static func markAllDMs(
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String
  ) async -> Result {
    let built = planAllDMs(
      channelAttention: EchoAttentionSync.shared.snapshot.channelAttention,
      ignoreLocalCursor: true)
    return await execute(built, baseURL: baseURL, auth: auth, userID: userID)
  }

  /// Web `handleServerRailMarkAllRead` — merge unread plans across joined guilds.
  static func planAllServers(
    serverIDs: [String],
    channelAttention: [String: EchoAttentionChannelSummary],
    ignoreLocalCursor: Bool = true
  ) -> Plan {
    var targets: [Target] = []
    var missing: [String] = []
    var seenChannel = Set<String>()
    for raw in serverIDs {
      let sid = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !sid.isEmpty, sid.lowercased() != "echo" else { continue }
      let part = plan(
        serverID: sid, channelAttention: channelAttention,
        ignoreLocalCursor: ignoreLocalCursor)
      for target in part.targets where seenChannel.insert(target.channelID).inserted {
        targets.append(target)
      }
      for channelID in part.channelIDsMissingLatestUnread
      where seenChannel.insert(channelID).inserted {
        missing.append(channelID)
      }
    }
    return Plan(targets: targets, channelIDsMissingLatestUnread: missing)
  }

  @MainActor
  static func markAllServers(
    serverIDs: [String],
    baseURL: URL,
    auth: EchoAuthenticationModel,
    userID: String
  ) async -> Result {
    let built = planAllServers(
      serverIDs: serverIDs,
      channelAttention: EchoAttentionSync.shared.snapshot.channelAttention,
      ignoreLocalCursor: true)
    return await execute(built, baseURL: baseURL, auth: auth, userID: userID)
  }

  static func hasUnreadGuildChannels(
    channelAttention: [String: EchoAttentionChannelSummary]
  ) -> Bool {
    channelAttention.values.contains {
      $0.kind?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "server"
        && $0.unreadCount > 0
    }
  }

  private static func latestMessageID(
    client: EchoHomeClient, token: String, channelID: String, userID: String
  ) async -> String? {
    guard
      let page = try? await client.loadMessages(
        accessToken: token, channelID: channelID, currentUserID: userID, limit: 1),
      let latest = page.messages.max(by: {
        ($0.timestamp ?? .distantPast) < ($1.timestamp ?? .distantPast)
      })
    else { return nil }
    return latest.id
  }
}
