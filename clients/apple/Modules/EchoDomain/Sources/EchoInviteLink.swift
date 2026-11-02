import Foundation

/// Public invite preview (`GET /invites/:code/preview`; web `EchoInvitePreviewDto`).
public struct EchoInvitePreview: Decodable, Equatable, Sendable {
  public let name: String
  public let iconURL: String?
  public let bannerURL: String?
  public let description: String?
  public let memberCount: Int
  public let serverID: String?
  public let voiceChannelName: String?
  public let isVoiceInvite: Bool
  public let requiresApplication: Bool

  private enum CodingKeys: String, CodingKey {
    case name, description, memberCount, voiceChannel, requiresApplication
    case iconURL = "iconUrl"
    case bannerURL = "bannerUrl"
    case serverID = "serverId"
  }

  private struct Voice: Decodable {
    let id: String?
    let name: String?
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    name = (try values.decodeIfPresent(String.self, forKey: .name) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    iconURL = try values.decodeIfPresent(String.self, forKey: .iconURL)
    bannerURL = try values.decodeIfPresent(String.self, forKey: .bannerURL)
    description = try values.decodeIfPresent(String.self, forKey: .description)
    memberCount = (try? values.decodeIfPresent(Int.self, forKey: .memberCount)) ?? 0
    serverID = try values.decodeIfPresent(String.self, forKey: .serverID)
    let voice = try? values.decodeIfPresent(Voice.self, forKey: .voiceChannel)
    isVoiceInvite = !(voice?.id?.trimmingCharacters(in: .whitespaces).isEmpty ?? true)
    voiceChannelName = voice?.name
    requiresApplication =
      (try? values.decodeIfPresent(Bool.self, forKey: .requiresApplication)) ?? false
  }
}

/// Finds Echo invite URLs in message text (web `splitContentByEchoInviteLinks` /
/// `isEchoInviteEmbedUrl`): `/invite/{hex}`, `/api/v1/echo/invites/{token}/share`, or a
/// single vanity slug on a trusted Echo origin.
public enum EchoInviteLinks {
  private static let candidate = try? NSRegularExpression(
    pattern: #"https?://([^/\s?#]+)(/[^\s?#]+)"#, options: [.caseInsensitive])

  public static func urls(in content: String, trustedHosts: Set<String>) -> [String] {
    guard content.contains("://"), let candidate else { return [] }
    let hosts = Set(trustedHosts.map { $0.lowercased() })
    let text = content as NSString
    var seen = Set<String>()
    var out: [String] = []
    for match in candidate.matches(in: content, range: NSRange(location: 0, length: text.length)) {
      let host = text.substring(with: match.range(at: 1)).lowercased()
      let hostOnly = host.split(separator: ":").first.map(String.init) ?? host
      guard hosts.contains(hostOnly) else { continue }
      let path = text.substring(with: match.range(at: 2))
        .trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!)]>\"'"))
      guard isInvitePath(path) else { continue }
      let origin = text.substring(
        with: NSRange(
          location: match.range.location,
          length: match.range(at: 1).upperBound - match.range.location))
      let link = origin + path
      if seen.insert(link).inserted { out.append(link) }
    }
    return out
  }

  static func isInvitePath(_ path: String) -> Bool {
    if path.range(of: #"^/api/v1/echo/invites/[^/]+/share/?$"#, options: [.regularExpression, .caseInsensitive]) != nil {
      return true
    }
    if path.range(of: #"^/invite/[a-f0-9]{6,}$"#, options: [.regularExpression, .caseInsensitive]) != nil {
      return true
    }
    let slug = String(path.dropFirst())
    guard !slug.isEmpty, !slug.contains("/"), slug.lowercased() != "invite",
      (3...32).contains(slug.count)
    else { return false }
    return slug.range(
      of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: [.regularExpression, .caseInsensitive]) != nil
  }
}
