import Foundation

/// `PATCH /servers/:id/roles/:rid` role icon fields (web `patchEchoRole` `roleIconUrl` +
/// `roleIconEmojiId`). Both keys are always sent together; `nil` clears.
public struct EchoRoleIconPatch: Equatable, Sendable {
  public var url: String?
  /// Server custom-emoji id; `nil` for plain image URLs and uploads.
  public var emojiID: String?

  public init(url: String?, emojiID: String? = nil) {
    self.url = url
    self.emojiID = emojiID
  }

  public static let clear = EchoRoleIconPatch(url: nil, emojiID: nil)

  /// Web `applyExternalImageUrl`: only http(s) URLs the backend accepts (≤ 2048 chars).
  public static func externalURL(_ raw: String) -> EchoRoleIconPatch? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count <= 2048, let url = URL(string: trimmed),
      let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
      url.host?.isEmpty == false
    else { return nil }
    return EchoRoleIconPatch(url: trimmed)
  }
}
