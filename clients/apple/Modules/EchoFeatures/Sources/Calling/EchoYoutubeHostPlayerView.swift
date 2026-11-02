import SwiftUI
import WebKit

/// Host-side YouTube IFrame player (controls visible). Loads whichever video the
/// queue points at and reports play / pause / seek samples back so the host can
/// publish them as `ytPlayback` (web `useVcYoutubeWatchTogetherPlayer` counterpart).
struct EchoYoutubeHostPlayerView {
  let videoID: String
  var onSample: (_ playing: Bool, _ time: Double) -> Void
  var onEnded: () -> Void

  @MainActor func makeCoordinator() -> Coordinator { Coordinator() }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let webView: WKWebView
    var onSample: (Bool, Double) -> Void = { _, _ in }
    var onEnded: () -> Void = {}
    private var pageLoaded = false
    private var loadedID: String?
    private var pendingID: String?

    override init() {
      let config = WKWebViewConfiguration()
      let controller = WKUserContentController()
      config.userContentController = controller
      #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
      #endif
      webView = WKWebView(frame: .zero, configuration: config)
      super.init()
      controller.add(self, name: "echoHost")
      webView.navigationDelegate = self
      #if os(iOS)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
      #endif
      webView.loadHTMLString(Self.html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
    }

    func apply(_ view: EchoYoutubeHostPlayerView) {
      onSample = view.onSample
      onEnded = view.onEnded
      guard loadedID != view.videoID else { return }
      loadedID = view.videoID
      // Ids are validated (11 URL-safe chars) upstream; still emit as a JSON string.
      let id = (try? String(data: JSONEncoder().encode(view.videoID), encoding: .utf8)) ?? "\"\""
      if pageLoaded {
        webView.evaluateJavaScript("echoLoad(\(id));")
      } else {
        pendingID = id
      }
    }

    func stop() {
      webView.evaluateJavaScript("echoStop();")
      webView.stopLoading()
      webView.configuration.userContentController.removeScriptMessageHandler(forName: "echoHost")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      pageLoaded = true
      if let pendingID { webView.evaluateJavaScript("echoLoad(\(pendingID));") }
      pendingID = nil
    }

    func userContentController(
      _ controller: WKUserContentController, didReceive message: WKScriptMessage
    ) {
      guard let body = message.body as? [String: Any] else { return }
      if body["ended"] as? Bool == true {
        onEnded()
      } else if let playing = body["playing"] as? Bool, let time = body["time"] as? Double {
        onSample(playing, time)
      }
    }

    private static let html = """
      <!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
      </head><body><div id="p"></div><script>
      var player=null,pending=null,timer=null;
      function post(m){window.webkit.messageHandlers.echoHost.postMessage(m);}
      function sample(playing){if(player&&player.getCurrentTime){post({playing:playing,time:player.getCurrentTime()});}}
      function clearTick(){if(timer){clearInterval(timer);timer=null;}}
      function onYouTubeIframeAPIReady(){
        player=new YT.Player('p',{width:'100%',height:'100%',host:'https://www.youtube-nocookie.com',
          playerVars:{rel:0,playsinline:1,controls:1,enablejsapi:1},
          events:{
            onReady:function(){if(pending){echoLoad(pending);}},
            onStateChange:function(e){
              if(e.data===1){sample(true);if(!timer){timer=setInterval(function(){sample(true);},2200);}}
              else if(e.data===2){clearTick();sample(false);}
              else if(e.data===0){clearTick();post({ended:true});}
            }}});
      }
      function echoLoad(id){
        if(!player||!player.loadVideoById){pending=id;return;}
        pending=null;player.loadVideoById(id,0);
      }
      function echoStop(){try{clearTick();player&&player.pauseVideo();}catch(e){}}
      </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
      """
  }
}

#if os(iOS)
  extension EchoYoutubeHostPlayerView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) { context.coordinator.apply(self) }
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#else
  extension EchoYoutubeHostPlayerView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { context.coordinator.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) { context.coordinator.apply(self) }
    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
      MainActor.assumeIsolated { coordinator.stop() }
    }
  }
#endif
