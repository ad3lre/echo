import Foundation

/// Runtime configuration shared by the iOS and macOS composition roots.
///
/// The bundle value is supplied by each app target's Info.plist, keeping
/// environment selection out of feature code and avoiding duplicated URLs.
public enum EchoAPIConfiguration {
  public static let defaultBaseURL =
    URL(string: "https://chat-echo.com") ?? URL(fileURLWithPath: "/")

  public static func baseURL(bundle: Bundle = .main) -> URL {
    guard
      let rawValue = bundle.object(forInfoDictionaryKey: "EchoAPIBaseURL") as? String,
      let url = URL(string: rawValue.trimmingCharacters(in: .whitespacesAndNewlines)),
      isAllowedAPIBaseURL(url)
    else {
      return defaultBaseURL
    }
    return url
  }

  /// Production and remote environments must use HTTPS. Plain HTTP is only
  /// accepted for loopback hosts during local development.
  public static func isAllowedAPIBaseURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return false }
    if scheme == "https" { return true }
    guard scheme == "http" else { return false }
    let host = (url.host ?? "").lowercased()
    return host == "localhost" || host == "127.0.0.1" || host == "::1"
  }
}
