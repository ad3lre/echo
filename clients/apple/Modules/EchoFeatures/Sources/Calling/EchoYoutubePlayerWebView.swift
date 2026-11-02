import SwiftUI
import WebKit

/// Follower-only YouTube IFrame player. The host's `youtube_activity` playback
/// sample drives load / seek / play / pause; local controls are hidden so the
/// follower cannot drift from the host. Mirrors the drift rule in web
/// `useVcYoutubeWatchTogetherPlayer` (seek when off by more than 1.25s).
struct EchoYoutubePlayerWebView {
  let videoID: String
  let playback: EchoYoutubePlaybackSync?
  /// Changes whenever the host publishes a new message so we re-apply the sample.
  let revision: Double

  @MainActor func makeCoordinator() -> Coordinator { Coordinator() }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    private var pageLoaded = false
    private var lastApplied: (id: String, revision: Double)?
    private var pendingScript: String?

    override init() {
      let config = WKWebViewConfiguration()
      #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
      #endif
      webView = WKWebView(frame: .zero, configuration: config)
      super.init()
      webView.navigationDelegate = self
      #if os(iOS)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
      #endif
      webView.loadHTMLString(Self.html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
    }

    func apply(_ view: EchoYoutubePlayerWebView) {
      let key = (view.videoID, view.revision)
      guard lastApplied?.id != key.0 || lastApplied?.revision != key.1 else { return }
      lastApplied = key
      let playing = view.playback?.playing ?? false
      let target = view.playback?.expectedMediaTime() ?? 0
      // `videoID` is validated (11 URL-safe chars) upstream; still emit as a JSON string.
      let id = (try? String(data: JSONEncoder().encode(view.videoID), encoding: .utf8)) ?? "\"\""
      let script = "echoSync(\(id),\(playing),\(target));"
      if pageLoaded {
        webView.evaluateJavaScript(script)
      } else {
        pendingScript = script
      }
    }

    func stop() {
      webView.evaluateJavaScript("echoStop();")
      webView.stopLoading()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      pageLoaded = true
      if let pendingScript { webView.evaluateJavaScript(pendingScript) }
      pendingScript = nil
    }

    private static let html = """
      <!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
      </head><body><div id="p"></div><script>
      var player=null,pending=null,cur=null;
      function onYouTubeIframeAPIReady(){
        player=new YT.Player('p',{width:'100%',height:'100%',host:'https://www.youtube-nocookie.com',
          playerVars:{rel:0,playsinline:1,controls:0,disablekb:1,enablejsapi:1},
          events:{onReady:function(){if(pending){echoSync(pending[0],pending[1],pending[2]);}}}});
      }
      function echoSync(id,playing,t){
        if(!player||!player.loadVideoById){pending=[id,playing,t];return;}
        pending=null;
        if(cur!==id){cur=id;if(playing){player.loadVideoById(id,t);}else{player.cueVideoById(id,t);}return;}
        if(Math.abs(player.getCurrentTime()-t)>1.25){player.seekTo(t,true);}
        if(playing){player.playVideo();}else{player.pauseVideo();}
      }
      function echoStop(){try{player&&player.pauseVideo();}catch(e){}}
      </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
      """
  }
}

#if os(iOS)
  extension EchoYoutubePlayerWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) { context.coordinator.apply(self) }
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#else
  extension EchoYoutubePlayerWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) { context.coordinator.apply(self) }
    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#endif
