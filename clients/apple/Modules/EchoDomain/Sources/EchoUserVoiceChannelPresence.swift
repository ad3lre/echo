import Foundation

/// One guild voice channel that currently lists a user (`UserVoiceChannelPresence`).
public struct EchoUserVoiceChannelPresence: Equatable, Sendable, Identifiable {
  public var id: String { "\(serverID):\(channelID)" }
  public let serverID: String
  public let serverName: String
  public let serverBannerURL: String?
  public let channelID: String
  public let channelName: String
  public let participantUserIDs: [String]
  public let participantAvatarURLs: [String]

  public init(
    serverID: String,
    serverName: String,
    serverBannerURL: String? = nil,
    channelID: String,
    channelName: String,
    participantUserIDs: [String],
    participantAvatarURLs: [String] = []
  ) {
    self.serverID = serverID
    self.serverName = serverName
    self.serverBannerURL = serverBannerURL
    self.channelID = channelID
    self.channelName = channelName
    self.participantUserIDs = participantUserIDs
    self.participantAvatarURLs = participantAvatarURLs
  }
}

/// Scan hydrated guild channels for voice rows listing `userID` (web `findUserVoicePresences`).
public enum EchoUserVoiceChannelPresenceFinder {
  public static func find(
    userID: String,
    channelsByServer: [String: [EchoGuildChannel]],
    servers: [EchoServerSummary],
    avatarURLByUserID: [String: String] = [:],
    preferServerID: String? = nil
  ) -> [EchoUserVoiceChannelPresence] {
    let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !uid.isEmpty else { return [] }

    let nameByID = Dictionary(
      uniqueKeysWithValues: servers.map {
        ($0.id, $0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Server" : $0.name)
      })
    let bannerByID = Dictionary(
      uniqueKeysWithValues: servers.compactMap { server -> (String, String)? in
        guard let banner = server.bannerURL?.trimmingCharacters(in: .whitespacesAndNewlines),
          !banner.isEmpty
        else { return nil }
        return (server.id, banner)
      })

    var out: [EchoUserVoiceChannelPresence] = []
    var seenChannel = Set<String>()

    for (serverID, channels) in channelsByServer {
      if serverID.isEmpty || serverID == "echo" { continue }
      for channel in channels where channel.isVoiceLike {
        let ids = channel.voiceParticipantIDs.map {
          $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty }
        guard ids.contains(uid) else { continue }
        let cid = channel.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cid.isEmpty, !seenChannel.contains(cid) else { continue }
        seenChannel.insert(cid)
        let pfps = ids.compactMap { id -> String? in
          let url = avatarURLByUserID[id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          return url.isEmpty ? nil : url
        }
        let channelName = channel.name.trimmingCharacters(in: .whitespacesAndNewlines)
        out.append(
          EchoUserVoiceChannelPresence(
            serverID: serverID,
            serverName: nameByID[serverID] ?? "Server",
            serverBannerURL: bannerByID[serverID],
            channelID: cid,
            channelName: channelName.isEmpty ? "Voice" : channelName,
            participantUserIDs: ids,
            participantAvatarURLs: pfps
          ))
      }
    }

    let pref = preferServerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !pref.isEmpty, pref != "echo" {
      out.sort { a, b in
        let da = a.serverID == pref ? 0 : 1
        let db = b.serverID == pref ? 0 : 1
        return da < db
      }
    }
    return out
  }
}
