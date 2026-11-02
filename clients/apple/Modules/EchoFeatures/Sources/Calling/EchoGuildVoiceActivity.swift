import Foundation

/// Swift mirrors of the web LiveKit data-channel codecs for guild VC activities
/// (`clients/web/src/audio/voiceData/youtubeActivity.ts`, `vcActivityPresence.ts`).
/// Wire format is UTF-8 JSON; unknown payloads decode to `nil` so other
/// activity types (games) are ignored rather than rejected.

struct EchoYoutubePlaylistEntry: Decodable, Equatable, Sendable {
  var id: String
  var title: String
  var channelTitle: String
  var thumbnailUrl: String?

  /// YouTube video ids are 11 URL-safe chars; reject anything else before it
  /// reaches a URL or the embedded player script.
  var isValidVideoID: Bool {
    id.count == 11
      && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
  }

  init(id: String, title: String, channelTitle: String, thumbnailUrl: String? = nil) {
    self.id = id
    self.title = title
    self.channelTitle = channelTitle
    self.thumbnailUrl = thumbnailUrl
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    id = try c.decode(String.self, forKey: .id)
    title = (try? c.decode(String.self, forKey: .title)) ?? ""
    channelTitle = (try? c.decode(String.self, forKey: .channelTitle)) ?? ""
    thumbnailUrl = try? c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
  }

  private enum Keys: String, CodingKey { case id, title, channelTitle, thumbnailUrl }
}

/// Wall-clock anchored sample: media time in seconds at `wallMs` (publisher `Date.now()`).
struct EchoYoutubePlaybackSync: Decodable, Equatable, Sendable {
  var playing: Bool
  var mediaTimeSec: Double
  var wallMs: Double

  /// Where the host's playhead should be now (mirrors web `expectedMediaTime`).
  func expectedMediaTime(now: Date = Date()) -> Double {
    guard playing else { return max(0, mediaTimeSec) }
    return max(0, mediaTimeSec + (now.timeIntervalSince1970 * 1000 - wallMs) / 1000)
  }
}

struct EchoYoutubeActivity: Equatable, Sendable {
  var updatedAt: Double
  var fromUserID: String
  var fromName: String?
  /// `closed`, `pick`, `youtube`, … — only `youtube` drives the follower UI.
  var activityPhase: String
  var playlist: [EchoYoutubePlaylistEntry]
  var currentIndex: Int
  var youtubeBrowseOpen: Bool
  var playback: EchoYoutubePlaybackSync?

  var isYoutubePhase: Bool { activityPhase == "youtube" }

  var currentEntry: EchoYoutubePlaylistEntry? {
    guard playlist.indices.contains(currentIndex) else { return nil }
    let entry = playlist[currentIndex]
    return entry.isValidVideoID ? entry : nil
  }
}

/// Which activity surfaces a peer has open (`vc_activity_presence`).
struct EchoVcActivityPresence: Equatable, Sendable {
  var updatedAt: Double
  var activities: [String]
}

enum EchoGuildVoiceData: Sendable {
  case youtube(EchoYoutubeActivity)
  case presence(EchoVcActivityPresence)
  case watchTogether(EchoWatchTogetherActivity)

  static func decode(_ data: Data) -> EchoGuildVoiceData? {
    guard let header = try? JSONDecoder().decode(Header.self, from: data), header.v == 1 else {
      return nil
    }
    switch header.t {
    case "youtube_activity":
      return (try? JSONDecoder().decode(YoutubeWire.self, from: data)).flatMap { $0.activity }
        .map { .youtube($0) }
    case "vc_activity_presence":
      guard let wire = try? JSONDecoder().decode(PresenceWire.self, from: data) else { return nil }
      return .presence(
        EchoVcActivityPresence(updatedAt: wire.updatedAt, activities: wire.activities))
    case "watch_together_activity":
      return EchoWatchTogetherActivity.decode(data).map { .watchTogether($0) }
    default:
      return nil
    }
  }

  private struct Header: Decodable {
    var v: Int
    var t: String
  }

  private struct PresenceWire: Decodable {
    var updatedAt: Double
    var activities: [String]
  }

  private struct YoutubeWire: Decodable {
    var updatedAt: Double
    var fromUserId: String
    var fromName: String?
    var activityPhase: String
    var playlist: [Lossy<EchoYoutubePlaylistEntry>]
    var currentIndex: Double
    var youtubeBrowseOpen: Bool
    var ytPlayback: EchoYoutubePlaybackSync?

    private enum Keys: String, CodingKey {
      case updatedAt, fromUserId, fromName, activityPhase, playlist, currentIndex
      case youtubeBrowseOpen, ytPlayback
    }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: Keys.self)
      updatedAt = try c.decode(Double.self, forKey: .updatedAt)
      fromUserId = try c.decode(String.self, forKey: .fromUserId)
      fromName = try? c.decodeIfPresent(String.self, forKey: .fromName)
      activityPhase = try c.decode(String.self, forKey: .activityPhase)
      playlist = try c.decode([Lossy<EchoYoutubePlaylistEntry>].self, forKey: .playlist)
      currentIndex = try c.decode(Double.self, forKey: .currentIndex)
      youtubeBrowseOpen = try c.decode(Bool.self, forKey: .youtubeBrowseOpen)
      // A malformed sample is dropped (web parity) without invalidating the message.
      ytPlayback = try? c.decodeIfPresent(EchoYoutubePlaybackSync.self, forKey: .ytPlayback)
    }

    var activity: EchoYoutubeActivity? {
      let trimmed = fromUserId.trimmingCharacters(in: .whitespaces)
      guard !trimmed.isEmpty, currentIndex.isFinite else { return nil }
      return EchoYoutubeActivity(
        updatedAt: updatedAt,
        fromUserID: trimmed,
        fromName: fromName,
        activityPhase: activityPhase,
        playlist: playlist.compactMap(\.value),
        currentIndex: Int(currentIndex),
        youtubeBrowseOpen: youtubeBrowseOpen,
        playback: ytPlayback)
    }
  }

  /// Skips malformed array rows (web drops rows without a string `id`).
  private struct Lossy<T: Decodable>: Decodable {
    var value: T?
    init(from decoder: Decoder) throws {
      value = try? T(from: decoder)
    }
  }
}
