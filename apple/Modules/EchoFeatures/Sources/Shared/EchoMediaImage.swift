import Combine
import EchoNetworking
import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

#if os(iOS) || os(macOS)
  import WebKit
#endif

/// Renders the media formats returned by Echo's profile and messaging APIs.
/// Data URLs are handled locally; ordinary URLs use SwiftUI's native loader.
/// Authenticated Echo CDN / upload URLs are signed when an access token is available.
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
          if dataURL.isEchoGeneratedAvatar {
            placeholder()
          } else {
            #if os(iOS) || os(macOS)
              EchoSVGImage(data: dataURL.data)
            #else
              placeholder()
            #endif
          }
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
      fetchURL = await resolveFetchURL()
    }
  }

  private var resolveTaskID: String {
    let tokenHint = auth.activeSession?.accessToken ?? accessToken ?? ""
    return "\(source ?? "")|\(storageKey ?? "")|\(tokenHint.isEmpty ? "0" : "1")"
  }

  private func resolveFetchURL() async -> URL? {
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
      return try await signedURL(for: original, accessToken: initialToken)
    } catch {
      if EchoAuthenticationModel.isUnauthorized(error),
        let refreshed = try? await auth.ensureAccessToken(forceRefresh: true),
        !refreshed.isEmpty
      {
        return try? await signedURL(for: original, accessToken: refreshed)
      }
      return original
    }
  }

  private func signedURL(for original: URL, accessToken: String) async throws -> URL {
    let signed = try await EchoSignedURLCache.shared.resolve(
      baseURL: baseURL,
      accessToken: accessToken,
      publicURL: original.absoluteString,
      storageKey: storageKey)
    return URL(string: signed) ?? original
  }
}

/// Process-wide cache of signed CDN URLs keyed by storageKey or public URL.
private actor EchoSignedURLCache {
  static let shared = EchoSignedURLCache()

  private var values: [String: (url: String, expiresAt: Date)] = [:]
  private var inFlight: [String: Task<SignedMediaURL, Error>] = [:]

  func resolve(
    baseURL: URL,
    accessToken: String,
    publicURL: String,
    storageKey: String?
  ) async throws -> String {
    let key = cacheKey(storageKey: storageKey, publicURL: publicURL)
    if let hit = values[key], hit.expiresAt > Date() {
      return hit.url
    }
    if let task = inFlight[key] {
      let signed = try await task.value
      return signed.url
    }
    let task = Task<SignedMediaURL, Error> {
      let client = EchoMediaSignClient(baseURL: baseURL)
      return try await client.signURL(
        storageKey: storageKey,
        publicURL: publicURL,
        accessToken: accessToken)
    }
    inFlight[key] = task
    defer { inFlight[key] = nil }
    let signed = try await task.value
    // Honor server expiry with a 60s skew so we never serve a near-expired URL.
    values[key] = (signed.url, signed.expiresAt.addingTimeInterval(-60))
    return signed.url
  }

  private func cacheKey(storageKey: String?, publicURL: String) -> String {
    if let storageKey, !storageKey.isEmpty { return "key:\(storageKey)" }
    return "url:\(publicURL)"
  }
}

func echoMediaURLNeedsSigning(_ url: String, storageKey: String?) -> Bool {
  let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty { return false }
  let lower = trimmed.lowercased()
  if lower.hasPrefix("data:") || lower.hasPrefix("blob:") { return false }
  if let parsed = URL(string: trimmed),
    let items = URLComponents(url: parsed, resolvingAgainstBaseURL: false)?.queryItems,
    items.contains(where: { $0.name == "t" && ($0.value?.isEmpty == false) })
  {
    return false
  }
  if let storageKey, !storageKey.isEmpty { return true }
  return trimmed.contains("/v1/o/") || trimmed.contains("/api/v1/echo/uploads/")
}

/// A process-wide data cache prevents profile pictures from refetching when
/// SwiftUI recreates a row during refresh, search, or presence updates.
private actor EchoImageDataCache {
  static let shared = EchoImageDataCache()

  private var values: [URL: Data] = [:]
  private var cacheOrder: [URL] = []
  private var inFlight: [URL: Task<Data, Error>] = [:]
  private let maximumEntries = 256

  func data(for url: URL) async throws -> Data {
    if let value = values[url] { return value }
    if let task = inFlight[url] { return try await task.value }

    let task = Task<Data, Error> {
      var request = URLRequest(url: url)
      request.cachePolicy = .returnCacheDataElseLoad
      request.setValue("image/*", forHTTPHeaderField: "Accept")
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let response = response as? HTTPURLResponse,
        (200..<300).contains(response.statusCode), !data.isEmpty
      else {
        throw URLError(.badServerResponse)
      }
      return data
    }
    inFlight[url] = task
    defer { inFlight[url] = nil }
    let value = try await task.value
    values[url] = value
    cacheOrder.removeAll { $0 == url }
    cacheOrder.append(url)
    if cacheOrder.count > maximumEntries, let expired = cacheOrder.first {
      cacheOrder.removeFirst()
      values.removeValue(forKey: expired)
    }
    return value
  }
}

/// Keeps decoded images alive across row/view recreation. SwiftUI's lazy stacks
/// can tear down and rebuild avatar rows while scrolling or when presence data
/// changes; retaining the decoded image avoids a placeholder flash and another
/// decode even when the URL is already present in `EchoImageDataCache`.
@MainActor
private final class EchoDecodedImageCache {
  static let shared = EchoDecodedImageCache()

  private var values: [URL: Image] = [:]
  private var cacheOrder: [URL] = []
  private let maximumEntries = 256

  func image(for url: URL) -> Image? {
    guard let image = values[url] else { return nil }
    cacheOrder.removeAll { $0 == url }
    cacheOrder.append(url)
    return image
  }

  func insert(_ image: Image, for url: URL) {
    values[url] = image
    cacheOrder.removeAll { $0 == url }
    cacheOrder.append(url)
    if cacheOrder.count > maximumEntries, let expired = cacheOrder.first {
      cacheOrder.removeFirst()
      values.removeValue(forKey: expired)
    }
  }
}

@MainActor
private final class EchoImageLoader: ObservableObject {
  @Published private(set) var image: Image?
  @Published private(set) var isLoading = false
  private var requestTask: Task<Void, Never>?
  private var loadedURL: URL?
  private var loadGeneration = 0

  func load(url: URL) {
    // `.task(id:)` can be re-established when a lazy row is rebuilt. Keep the
    // current image in place for the same URL instead of restarting the load.
    if loadedURL == url {
      if image != nil || isLoading { return }
    } else {
      requestTask?.cancel()
      loadedURL = url
      image = nil
    }

    requestTask?.cancel()
    loadGeneration &+= 1
    let generation = loadGeneration
    // Set this before creating the async task. SwiftUI may attach the same
    // task more than once in a single update pass; doing it inside the task
    // leaves a small race where both loads can cancel and restart each other.
    isLoading = true
    requestTask = Task { [weak self] in
      guard let self else { return }
      defer {
        if generation == self.loadGeneration {
          isLoading = false
        }
      }

      if let cached = EchoDecodedImageCache.shared.image(for: url) {
        guard generation == self.loadGeneration else { return }
        image = cached
        return
      }

      do {
        let data = try await EchoImageDataCache.shared.data(for: url)
        guard !Task.isCancelled, generation == self.loadGeneration,
          let decoded = platformImage(data)
        else { return }
        EchoDecodedImageCache.shared.insert(decoded, for: url)
        image = decoded
      } catch {
        guard !Task.isCancelled else { return }
      }
    }
  }

  deinit {
    requestTask?.cancel()
  }
}

private struct EchoRemoteImage<Placeholder: View>: View {
  let url: URL
  @ViewBuilder let placeholder: () -> Placeholder
  @StateObject private var loader = EchoImageLoader()

  var body: some View {
    Group {
      if let image = loader.image {
        image.resizable().scaledToFill()
      } else {
        placeholder().overlay {
          if loader.isLoading {
            ProgressView().tint(.white.opacity(0.55))
          }
        }
      }
    }
    .task(id: url) {
      loader.load(url: url)
    }
  }
}

#if os(iOS) || os(macOS)
  private struct EchoSVGImage: View {
    let data: Data

    var body: some View {
      EchoSVGWebView(data: data)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  @MainActor
  private func makeSVGWebViewConfiguration() -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.defaultWebpagePreferences.allowsContentJavaScript = false
    return config
  }

  #if os(iOS)
    private struct EchoSVGWebView: UIViewRepresentable {
      let data: Data

      final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedData: Data?
        var hasLoadedInitialDocument = false

        func webView(
          _ webView: WKWebView,
          decidePolicyFor navigationAction: WKNavigationAction,
          decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
          if !hasLoadedInitialDocument, navigationAction.navigationType == .other {
            hasLoadedInitialDocument = true
            decisionHandler(.allow)
            return
          }
          decisionHandler(.cancel)
        }
      }

      func makeCoordinator() -> Coordinator { Coordinator() }

      @MainActor
      func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: makeSVGWebViewConfiguration())
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.isUserInteractionEnabled = false
        load(data, in: view, coordinator: context.coordinator)
        return view
      }

      @MainActor
      func updateUIView(_ view: WKWebView, context: Context) {
        load(data, in: view, coordinator: context.coordinator)
      }

      @MainActor
      private func load(_ data: Data, in view: WKWebView, coordinator: Coordinator) {
        guard coordinator.loadedData != data else { return }
        coordinator.loadedData = data
        coordinator.hasLoadedInitialDocument = false
        let source = data.base64EncodedString()
        let html = """
          <!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>
          <body style=\"margin:0;background:transparent;overflow:hidden\"><img src=\"data:image/svg+xml;base64,\(source)\" style=\"display:block;width:100%;height:100%;object-fit:cover\"></body></html>
          """
        view.loadHTMLString(html, baseURL: nil)
      }
    }
  #else
    private struct EchoSVGWebView: NSViewRepresentable {
      let data: Data

      final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedData: Data?
        var hasLoadedInitialDocument = false

        func webView(
          _ webView: WKWebView,
          decidePolicyFor navigationAction: WKNavigationAction,
          decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
          if !hasLoadedInitialDocument, navigationAction.navigationType == .other {
            hasLoadedInitialDocument = true
            decisionHandler(.allow)
            return
          }
          decisionHandler(.cancel)
        }
      }

      func makeCoordinator() -> Coordinator { Coordinator() }

      @MainActor
      func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: makeSVGWebViewConfiguration())
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        load(data, in: view, coordinator: context.coordinator)
        return view
      }

      @MainActor
      func updateNSView(_ view: WKWebView, context: Context) {
        load(data, in: view, coordinator: context.coordinator)
      }

      @MainActor
      private func load(_ data: Data, in view: WKWebView, coordinator: Coordinator) {
        guard coordinator.loadedData != data else { return }
        coordinator.loadedData = data
        coordinator.hasLoadedInitialDocument = false
        let source = data.base64EncodedString()
        let html = """
          <!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>
          <body style=\"margin:0;background:transparent;overflow:hidden\"><img src=\"data:image/svg+xml;base64,\(source)\" style=\"display:block;width:100%;height:100%;object-fit:cover\"></body></html>
          """
        view.loadHTMLString(html, baseURL: nil)
      }
    }
  #endif
#endif

private struct EchoDataURL {
  let mimeType: String
  let data: Data

  var isEchoGeneratedAvatar: Bool {
    guard mimeType == "image/svg+xml", let svg = String(data: data, encoding: .utf8) else {
      return false
    }
    return svg.contains("viewBox=\"0 0 128 128\"")
      && svg.contains("<rect width=\"128\" height=\"128\"")
      && svg.contains("dominant-baseline=\"central\"")
  }

  init?(_ value: String?) {
    guard let value, value.lowercased().hasPrefix("data:") else { return nil }
    let parts = value.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
    guard parts.count == 2 else { return nil }
    let metadata = String(parts[0]).dropFirst(5)
    let metadataParts = metadata.split(separator: ";")
    guard let mimeType = metadataParts.first, !mimeType.isEmpty else { return nil }
    let payload = String(parts[1])
    let data: Data?
    if metadataParts.contains("base64") {
      data = Data(base64Encoded: payload)
    } else {
      data = payload.removingPercentEncoding?.data(using: .utf8)
    }
    guard let data else { return nil }
    self.mimeType = String(mimeType).lowercased()
    self.data = data
  }
}

func platformImage(_ data: Data) -> Image? {
  #if os(iOS)
    if let image = UIImage(data: data) { Image(uiImage: image) } else { nil }
  #elseif os(macOS)
    if let image = NSImage(data: data) { Image(nsImage: image) } else { nil }
  #else
    nil
  #endif
}

private func resolvedURL(_ value: String?, baseURL: URL) -> URL? {
  guard let value, !value.isEmpty else { return nil }
  if let url = URL(string: value), url.scheme != nil { return url }
  guard value.hasPrefix("/") else { return nil }
  return URL(string: value, relativeTo: baseURL)?.absoluteURL
}
