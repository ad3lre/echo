import SwiftUI
import WebKit

/// Inline YouTube / Vimeo player for an expanded link-embed card (web `MessageLinkEmbeds` iframe).
/// Ephemeral data store, no top-level navigation after the first load, and no link activation —
/// the player cannot be used to browse away inside the chat surface.
struct EchoVideoEmbedWebView {
  let video: EchoVideoEmbedRef

  @MainActor func makeCoordinator() -> Coordinator { Coordinator(video: video) }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    private var allowsInitialLoad = true

    init(video: EchoVideoEmbedRef) {
      let config = WKWebViewConfiguration()
      config.websiteDataStore = .nonPersistent()
      #if os(iOS)
        config.allowsInlineMediaPlayback = true
      #endif
      webView = WKWebView(frame: .zero, configuration: config)
      super.init()
      webView.navigationDelegate = self
      #if os(iOS)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
      #endif
      webView.loadHTMLString(video.html, baseURL: video.baseURL)
    }

    func stop() {
      webView.stopLoading()
      webView.loadHTMLString("", baseURL: nil)
    }

    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
      // Sub-frame loads (the player itself) are fine; the host page may only load once.
      guard let frame = action.targetFrame else { return decisionHandler(.cancel) }
      if !frame.isMainFrame {
        decisionHandler(action.navigationType == .linkActivated ? .cancel : .allow)
      } else if allowsInitialLoad {
        allowsInitialLoad = false
        decisionHandler(.allow)
      } else {
        decisionHandler(.cancel)
      }
    }
  }
}

#if os(iOS)
  extension EchoVideoEmbedWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#else
  extension EchoVideoEmbedWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#endif
