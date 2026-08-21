import Foundation

/// Shared fetch / trust rules for Echo media and markdown image URLs.
///
/// Chat peers can inject arbitrary http(s) URLs into markdown. Auto-fetching
/// those would turn the client into a probe against LAN hosts (especially with
/// `NSAllowsLocalNetworking`). Attachment/avatar URLs from the API are still
/// fetched, but only over safe schemes and never against unexpected private
/// hosts unless they match the configured API base.
enum EchoURLPolicy {
  static let knownEchoHosts: Set<String> = [
    "chat-echo.com",
    "www.chat-echo.com",
  ]

  /// Schemes Echo will ever issue a network request for.
  static func isAllowedFetchScheme(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return false }
    if scheme == "https" { return true }
    guard scheme == "http" else { return false }
    return isLoopbackHost(url.host)
  }

  /// Attachment / avatar / signed-media fetches.
  static func isAllowedMediaURL(_ url: URL, apiBaseURL: URL) -> Bool {
    guard isAllowedFetchScheme(url) else { return false }
    guard let host = normalizedHost(url.host), !host.isEmpty else { return false }
    if isLoopbackHost(host) { return true }
    if isPrivateOrLinkLocalHost(host) {
      return host == normalizedHost(apiBaseURL.host)
    }
    return true
  }

  /// Markdown `![](…)` auto-load — only first-party Echo hosts (and the API host).
  static func isTrustedMarkdownImageURL(_ url: URL, apiBaseURL: URL) -> Bool {
    guard isAllowedMediaURL(url, apiBaseURL: apiBaseURL) else { return false }
    guard let host = normalizedHost(url.host) else { return false }
    var allowed = knownEchoHosts
    if let apiHost = normalizedHost(apiBaseURL.host), !apiHost.isEmpty {
      allowed.insert(apiHost)
    }
    return allowed.contains(host)
  }

  /// Defense-in-depth for the image data cache (no API base available).
  /// Allows https (any host) and loopback http only — never custom schemes.
  static func isAllowedCachedFetchURL(_ url: URL) -> Bool {
    isAllowedFetchScheme(url)
  }

  static func isLoopbackHost(_ host: String?) -> Bool {
    guard let host = normalizedHost(host) else { return false }
    return host == "localhost" || host == "127.0.0.1" || host == "::1"
  }

  static func isPrivateOrLinkLocalHost(_ host: String?) -> Bool {
    guard let host = normalizedHost(host), !host.isEmpty else { return false }
    if isLoopbackHost(host) { return true }
    if host.hasSuffix(".local") || host.hasSuffix(".localhost") { return true }
    if host == "0.0.0.0" || host == "::" || host == "0:0:0:0:0:0:0:0" { return true }

    if let ipv4 = ipv4Octets(host) {
      let a = ipv4[0], b = ipv4[1]
      if a == 10 { return true }
      if a == 127 { return true }
      if a == 169, b == 254 { return true }
      if a == 172, (16...31).contains(b) { return true }
      if a == 192, b == 168 { return true }
      if a == 100, (64...127).contains(b) { return true }  // CGNAT
      return false
    }

    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
    if host.hasPrefix("fc") || host.hasPrefix("fd") { return true }
    if host.hasPrefix("fe8") || host.hasPrefix("fe9") || host.hasPrefix("fea")
      || host.hasPrefix("feb")
    {
      return true
    }
    return false
  }

  private static func normalizedHost(_ host: String?) -> String? {
    guard var host = host?.lowercased(), !host.isEmpty else { return nil }
    if host.hasPrefix("["), host.hasSuffix("]") {
      host = String(host.dropFirst().dropLast())
    }
    return host
  }

  private static func ipv4Octets(_ host: String) -> [Int]? {
    let parts = host.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return nil }
    let octets = parts.compactMap { Int($0) }
    guard octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }) else { return nil }
    return octets
  }
}

/// Resolves relative Echo media paths against the API base. Absolute URLs must
/// use an allowed fetch scheme; `file:`, `javascript:`, custom schemes, etc. are rejected.
func resolvedURL(_ value: String?, baseURL: URL) -> URL? {
  guard let value, !value.isEmpty else { return nil }
  let candidate: URL?
  if let url = URL(string: value), let scheme = url.scheme, !scheme.isEmpty {
    candidate = url
  } else if value.hasPrefix("/") {
    candidate = URL(string: value, relativeTo: baseURL)?.absoluteURL
  } else {
    return nil
  }
  guard let candidate, EchoURLPolicy.isAllowedMediaURL(candidate, apiBaseURL: baseURL) else {
    return nil
  }
  return candidate
}
