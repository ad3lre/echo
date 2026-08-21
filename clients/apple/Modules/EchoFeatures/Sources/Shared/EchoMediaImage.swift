import Combine
import EchoNetworking
import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Renders the media formats returned by Echo's profile and messaging APIs.
/// Data URLs are handled locally; ordinary URLs use the authenticated image loader.
/// Authenticated Echo CDN / upload URLs are signed when an access token is available.
///
/// Untrusted SVG is never rendered in a WebView (subresource / parser risk). Echo's
/// generated-avatar SVG template is intentionally shown via `placeholder` instead.
struct EchoMediaImage<Placeholder: View>: View {
  let source: String?
  let baseURL: URL
  /// Optional override / preview fallback. Prefer the live auth environment token.
  var accessToken: String? = nil
  var storageKey: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @ViewBuilder let placeholder: () -> Placeholder
  @State private var fetchURL: URL?

  var body: some View {
    Group {
      if let dataURL = EchoDataURL(source) {
        if dataURL.mimeType == "image/svg+xml" {
          placeholder()
        } else if let image = platformImage(dataURL.data) {
          image.resizable().scaledToFill()
        } else {
          placeholder()
        }
      } else if let url = fetchURL {
        EchoRemoteImage(url: url, placeholder: placeholder)
      } else if resolvedURL(source, baseURL: baseURL) != nil {
        placeholder().overlay {
          ProgressView().tint(.white.opacity(0.55))
        }
      } else {
        placeholder()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: resolveTaskID) {
      fetchURL = await EchoMediaURLResolver.resolve(
        source: source,
        baseURL: baseURL,
        storageKey: storageKey,
        accessToken: accessToken,
        auth: auth)
    }
  }

  private var resolveTaskID: String {
    let tokenHint = auth.activeSession?.accessToken ?? accessToken ?? ""
    return "\(source ?? "")|\(storageKey ?? "")|\(tokenHint.isEmpty ? "0" : "1")"
  }
}

@MainActor
enum EchoMediaURLResolver {
  static func resolve(
    source: String?,
    baseURL: URL,
    storageKey: String?,
    accessToken: String?,
    auth: EchoAuthenticationModel
  ) async -> URL? {
    guard let original = resolvedURL(source, baseURL: baseURL) else { return nil }
    let raw = source ?? original.absoluteString
    guard echoMediaURLNeedsSigning(raw, storageKey: storageKey) else {
      return original
    }

    let initialToken: String
    if let live = try? await auth.ensureAccessToken(), !live.isEmpty {
      initialToken = live
    } else if let accessToken, !accessToken.isEmpty {
      initialToken = accessToken
    } else {
      return original
    }

    do {
      return try await signedURL(
        for: original, baseURL: baseURL, storageKey: storageKey, accessToken: initialToken)
    } catch {
      if EchoAuthenticationModel.isUnauthorized(error),
        let refreshed = try? await auth.ensureAccessToken(forceRefresh: true),
        !refreshed.isEmpty
      {
        return try? await signedURL(
          for: original, baseURL: baseURL, storageKey: storageKey, accessToken: refreshed)
      }
      return original
    }
  }

  private static func signedURL(
    for original: URL, baseURL: URL, storageKey: String?, accessToken: String
  ) async throws -> URL {
    let signed = try await EchoSignedURLCache.shared.resolve(
      baseURL: baseURL,
      accessToken: accessToken,
      publicURL: original.absoluteString,
      storageKey: storageKey)
    guard let signedURL = URL(string: signed),
      EchoURLPolicy.isAllowedMediaURL(signedURL, apiBaseURL: baseURL)
    else {
      throw URLError(.badURL)
    }
    return signedURL
  }
}
