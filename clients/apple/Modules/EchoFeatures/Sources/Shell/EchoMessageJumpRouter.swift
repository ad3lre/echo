import EchoDomain
import Foundation

/// Finds which surface owns a channel so a message link / search hit / `#channel` pill can
/// navigate across servers and into DMs (web resolves `/channels/:id/:messageId` the same way).
@MainActor
enum EchoMessageJumpRouter {
  enum Destination: Equatable {
    case dm(channelID: String)
    case guild(serverID: String, channelID: String)
  }

  /// DMs first (already loaded on Home), then every joined server's channel list; servers whose
  /// channels have not loaded yet are fetched lazily so a link into a cold server still resolves.
  static func resolve(
    channelID: String, dms: [EchoDirectMessage], servers: EchoServersModel?
  ) async -> Destination? {
    let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return nil }
    if dms.contains(where: { $0.channelID == id }) { return .dm(channelID: id) }
    guard let servers else { return nil }
    if let hit = cached(id, in: servers) { return hit }
    for server in servers.servers where servers.channelsByServer[server.id] == nil {
      await servers.loadChannels(for: server.id)
      if servers.channels(for: server.id).contains(where: { $0.id == id }) {
        return .guild(serverID: server.id, channelID: id)
      }
    }
    return nil
  }

  private static func cached(_ channelID: String, in servers: EchoServersModel) -> Destination? {
    for server in servers.servers
    where servers.channels(for: server.id).contains(where: { $0.id == channelID }) {
      return .guild(serverID: server.id, channelID: channelID)
    }
    return nil
  }
}
