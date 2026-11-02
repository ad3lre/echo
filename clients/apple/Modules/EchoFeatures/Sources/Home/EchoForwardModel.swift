import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Destination list + send for forwarding one message (web `useAppLayoutForwardMessage`).
@MainActor
@Observable
final class EchoForwardModel: Identifiable {
  nonisolated var id: String { source.id }
  let source: EchoMessage
  let sourceChannelID: String
  private let home: EchoHomeClient
  private let workspace: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel
  private let userID: String

  private(set) var directMessages: [EchoDirectMessage] = []
  private(set) var servers: [EchoServerSummary] = []
  private(set) var channelsByServer: [String: [EchoGuildChannel]] = [:]
  private(set) var isLoading = true
  private(set) var isSending = false
  var errorMessage: String?

  init(
    source: EchoMessage, sourceChannelID: String, baseURL: URL,
    auth: EchoAuthenticationModel, userID: String
  ) {
    self.source = source
    self.sourceChannelID = sourceChannelID
    self.home = EchoHomeClient(baseURL: baseURL)
    self.workspace = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
    self.userID = userID
  }

  func load() async {
    isLoading = true
    defer { isLoading = false }
    guard let token = try? await auth.ensureAccessToken() else {
      errorMessage = EchoCopy.string("Echo couldn’t load forward destinations.")
      return
    }
    if let snapshot = try? await home.load(accessToken: token, userID: userID) {
      directMessages = snapshot.conversations.filter { $0.channelID != sourceChannelID }
    }
    servers = (try? await workspace.loadServers(accessToken: token)) ?? []
    let workspace = workspace
    await withTaskGroup(of: (String, [EchoGuildChannel]).self) { group in
      for server in servers {
        group.addTask {
          (server.id, (try? await workspace.loadChannels(serverID: server.id, accessToken: token)) ?? [])
        }
      }
      for await (serverID, channels) in group {
        channelsByServer[serverID] = channels.filter {
          $0.isTextLike && !$0.isForumPost && $0.id != sourceChannelID
        }
      }
    }
  }

  func channels(in server: EchoServerSummary, matching query: String) -> [EchoGuildChannel] {
    let all = channelsByServer[server.id] ?? []
    guard !query.isEmpty else { return all }
    let serverHit = server.name.localizedCaseInsensitiveContains(query)
    return all.filter { serverHit || $0.name.localizedCaseInsensitiveContains(query) }
  }

  func directMessages(matching query: String) -> [EchoDirectMessage] {
    guard !query.isEmpty else { return directMessages }
    return directMessages.filter { $0.displayName.localizedCaseInsensitiveContains(query) }
  }

  /// `POST …/messages` with `forwardMessageId`; `true` once the server accepted it.
  func forward(to channelID: String) async -> Bool {
    guard !isSending else { return false }
    isSending = true
    errorMessage = nil
    defer { isSending = false }
    do {
      let token = try await auth.ensureAccessToken()
      try await home.forwardMessage(
        messageID: source.id, toChannelID: channelID, accessToken: token)
      return true
    } catch {
      errorMessage = EchoCopy.string("Couldn’t forward message")
      return false
    }
  }
}
