import SwiftUI
import WebKit

/// Third-party game embed (OpenGuessr, skribbl.io, …) hosted in a WKWebView.
/// Link taps that leave the embed's site are cancelled so the surface stays a game.
struct EchoEmbedWebView {
  let url: URL

  @MainActor func makeCoordinator() -> Coordinator { Coordinator(url: url) }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    private let site: String

    init(url: URL) {
      let config = WKWebViewConfiguration()
      #if os(iOS)
        config.allowsInlineMediaPlayback = true
      #endif
      webView = WKWebView(frame: .zero, configuration: config)
      site = Self.registrableDomain(of: url.host)
      super.init()
      webView.navigationDelegate = self
      #if os(iOS)
        webView.isOpaque = false
      #endif
      webView.load(URLRequest(url: url))
    }

    func stop() {
      webView.stopLoading()
      webView.loadHTMLString("", baseURL: nil)
    }

    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
      if action.navigationType == .linkActivated,
        Self.registrableDomain(of: action.request.url?.host) != site
      {
        decisionHandler(.cancel)
      } else {
        decisionHandler(.allow)
      }
    }

    private static func registrableDomain(of host: String?) -> String {
      (host ?? "").split(separator: ".").suffix(2).joined(separator: ".")
    }
  }
}

#if os(iOS)
  extension EchoEmbedWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#else
  extension EchoEmbedWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#endif
