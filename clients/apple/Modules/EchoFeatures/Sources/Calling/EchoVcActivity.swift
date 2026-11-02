import Foundation

/// Guild VC activities the Apple client can open. Mirrors the web catalog
/// (`server/activities/cores/vcActivityCatalog.ts`, `vcActivityTypes.ts`); only YouTube,
/// the third-party iframe embeds, Watch Together (follower + Echo+ host), Tic-Tac-Toe / Hangman /
/// Skriggles (game-server rooms over the Echo socket) and Wordline (solo, on-device since
/// `WORDLE_SERVER_MODE` is off) are implemented natively. Codenames stays web-only.
enum EchoVcActivity: String, CaseIterable, Identifiable, Sendable {
  case youtube
  case openguessr
  case skribblIo = "skribbl_io"
  case garticPhone = "gartic_phone"
  case krunker
  case richup
  case gooberDash = "goober_dash"
  case smashKarts = "smash_karts"
  case clusterRush = "cluster_rush"
  case watchTogether = "watch_together"
  case ticTacToe = "tic_tac_toe"
  case wordle
  case hangman
  case skriggles

  var id: String { rawValue }

  /// Mirrors `YOUTUBE_INTEGRATION_ENABLED` in `contracts/integrationKillSwitches.ts`.
  /// While off the server does not mount `/youtube/*` and web hides the YouTube card
  /// and badge, so Apple must not offer host mode either. Flip together with the contract.
  static let youtubeIntegrationEnabled = false

  /// Activities shown in the picker (web `isEchoVcActivityLibraryVisible`).
  static var libraryVisible: [EchoVcActivity] {
    allCases.filter {
      switch $0 {
      case .youtube: youtubeIntegrationEnabled
      case .watchTogether: EchoWatchTogether.isEnabled
      default: true
      }
    }
  }

  /// Brand names are not localized (same as web `vcIframeEmbedTitle`).
  var title: String {
    switch self {
    case .youtube: "YouTube"
    case .openguessr: "OpenGuessr"
    case .skribblIo: "skribbl.io"
    case .garticPhone: "Gartic Phone"
    case .krunker: "Krunker"
    case .richup: "Richup.io"
    case .gooberDash: "Goober Dash"
    case .smashKarts: "Smash Karts"
    case .clusterRush: "Cluster Rush"
    case .watchTogether: EchoCopy.string("Watch Together")
    case .ticTacToe: EchoCopy.string("Tic-Tac-Toe")
    case .wordle: EchoCopy.string("Wordline")
    case .hangman: EchoCopy.string("Hangman")
    case .skriggles: EchoCopy.string("Skriggles")
    }
  }

  var symbol: String {
    switch self {
    case .youtube: "play.rectangle.fill"
    case .watchTogether: "play.tv.fill"
    case .ticTacToe: "square.grid.3x3.fill"
    case .wordle: "textformat.abc"
    case .hangman: "figure.stand"
    case .skriggles: "scribble.variable"
    default: "gamecontroller.fill"
    }
  }

  /// Embedded page for iframe-style activities (web `vcIframeEmbedUrl`).
  var embedURL: URL? {
    let raw: String
    switch self {
    case .youtube, .watchTogether, .ticTacToe, .wordle, .hangman, .skriggles: return nil
    case .openguessr: raw = "https://openguessr.com/"
    case .skribblIo: raw = "https://skribbl.io/"
    case .garticPhone: raw = "https://garticphone.com/"
    case .krunker: raw = "https://krunker.io/"
    case .richup: raw = "https://richup.io/"
    case .gooberDash: raw = "https://gooberdash.winterpixel.io/"
    case .smashKarts: raw = "https://smashkarts.io/"
    case .clusterRush: raw = "https://clusterrush.io/game/cluster-rush/"
    }
    return URL(string: raw)
  }

  /// `activityPhase` / presence kind: identical to the raw value on web.
  var phase: String { rawValue }
}

/// Encoders for the data-channel messages Apple publishes. Field names and the
/// `v: 1` envelope match `youtubeActivity.ts` / `vcActivityPresence.ts` exactly.
enum EchoGuildVoiceWire {
  static func presence(activities: [String], now: Date = Date()) -> Data {
    encode([
      "v": 1, "t": "vc_activity_presence", "updatedAt": millis(now), "activities": activities,
    ])
  }

  static func activity(
    userID: String,
    name: String?,
    phase: String,
    playlist: [EchoYoutubePlaylistEntry] = [],
    currentIndex: Int = 0,
    playback: EchoYoutubePlaybackSync? = nil,
    now: Date = Date()
  ) -> Data {
    let isYoutube = phase == "youtube"
    var payload: [String: Any] = [
      "v": 1, "t": "youtube_activity", "updatedAt": millis(now), "fromUserId": userID,
      "activityPhase": phase,
      "playlist": isYoutube ? playlist.map(row) : [],
      "currentIndex": isYoutube ? currentIndex : 0,
      "youtubeBrowseOpen": false,
    ]
    if let name = name?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
      payload["fromName"] = name
    }
    if isYoutube, let playback {
      payload["ytPlayback"] = [
        "playing": playback.playing, "mediaTimeSec": playback.mediaTimeSec,
        "wallMs": playback.wallMs,
      ]
    }
    return encode(payload)
  }

  /// Wall-clock sample at `now` (web `Date.now()` ms).
  static func sample(playing: Bool, mediaTimeSec: Double, now: Date = Date())
    -> EchoYoutubePlaybackSync
  {
    EchoYoutubePlaybackSync(
      playing: playing, mediaTimeSec: max(0, mediaTimeSec), wallMs: millis(now))
  }

  static func millis(_ date: Date) -> Double {
    (date.timeIntervalSince1970 * 1000).rounded()
  }

  private static func row(_ entry: EchoYoutubePlaylistEntry) -> [String: Any] {
    [
      "id": entry.id, "title": entry.title, "channelTitle": entry.channelTitle,
      "thumbnailUrl": entry.thumbnailUrl ?? NSNull(),
    ]
  }

  static func encode(_ payload: [String: Any]) -> Data {
    (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
  }
}
