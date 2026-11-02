import Foundation

/// Normalizes Echo user IDs for equality checks across REST and realtime.
public enum EchoUserIdentity {
  public static func normalize(_ value: String?) -> String {
    value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
  }

  public static func matches(_ lhs: String?, _ rhs: String?) -> Bool {
    let a = normalize(lhs)
    let b = normalize(rhs)
    return !a.isEmpty && a == b
  }
}

/// Public profile data returned by the Echo social API.
public struct EchoUserProfile: Codable, Equatable, Hashable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let username: String?
  public let avatarURL: String?
  public let bio: String?
  public let bannerURL: String?
  public let bannerColor: String?
  public let badges: [String]?
  public let bannerPositionY: Double?
  /// Ambient blurred banner glow behind profile chrome (web `bannerRefractionEnabled`).
  public let bannerRefractionEnabled: Bool
  /// Frosted softness over the banner image (web `bannerBlurEnabled`).
  public let bannerBlurEnabled: Bool
  /// Dark scrim over the banner for depth contrast (web `bannerBlackoutEnabled`).
  public let bannerBlackoutEnabled: Bool
  /// IANA zone from the account (web Magic Time / `MessageAuthor.timeZone`).
  public let timeZone: String?

  public init(
    id: String,
    name: String,
    username: String? = nil,
    avatarURL: String? = nil,
    bio: String? = nil,
    bannerURL: String? = nil,
    bannerColor: String? = nil,
    badges: [String]? = nil,
    bannerPositionY: Double? = nil,
    bannerRefractionEnabled: Bool = false,
    bannerBlurEnabled: Bool = false,
    bannerBlackoutEnabled: Bool = false,
    timeZone: String? = nil
  ) {
    self.id = id
    self.name = name
    self.username = username
    self.avatarURL = avatarURL
    self.bio = bio
    self.bannerURL = bannerURL
    self.bannerColor = bannerColor
    self.badges = badges
    self.bannerPositionY = bannerPositionY
    self.bannerRefractionEnabled = bannerRefractionEnabled
    self.bannerBlurEnabled = bannerBlurEnabled
    self.bannerBlackoutEnabled = bannerBlackoutEnabled
    self.timeZone = timeZone
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    name = try container.decode(String.self, forKey: .name)
    username = try container.decodeIfPresent(String.self, forKey: .username)
    avatarURL = try container.decodeIfPresent(String.self, forKey: .avatarURL)
    bio = try container.decodeIfPresent(String.self, forKey: .bio)
    bannerURL = try container.decodeIfPresent(String.self, forKey: .bannerURL)
    bannerColor = try container.decodeIfPresent(String.self, forKey: .bannerColor)
    badges = try container.decodeIfPresent([String].self, forKey: .badges)
    bannerPositionY = try container.decodeIfPresent(Double.self, forKey: .bannerPositionY)
    bannerRefractionEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .bannerRefractionEnabled) ?? false
    bannerBlurEnabled = try container.decodeIfPresent(Bool.self, forKey: .bannerBlurEnabled) ?? false
    bannerBlackoutEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .bannerBlackoutEnabled) ?? false
    let rawTZ = try container.decodeIfPresent(String.self, forKey: .timeZone)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    timeZone = (rawTZ?.isEmpty == false) ? rawTZ : nil
  }

  /// Copy with selected banner-effect flags updated (settings toggles).
  public func withBannerEffects(
    refraction: Bool? = nil,
    blur: Bool? = nil,
    blackout: Bool? = nil
  ) -> EchoUserProfile {
    EchoUserProfile(
      id: id,
      name: name,
      username: username,
      avatarURL: avatarURL,
      bio: bio,
      bannerURL: bannerURL,
      bannerColor: bannerColor,
      badges: badges,
      bannerPositionY: bannerPositionY,
      bannerRefractionEnabled: refraction ?? bannerRefractionEnabled,
      bannerBlurEnabled: blur ?? bannerBlurEnabled,
      bannerBlackoutEnabled: blackout ?? bannerBlackoutEnabled,
      timeZone: timeZone)
  }
}
