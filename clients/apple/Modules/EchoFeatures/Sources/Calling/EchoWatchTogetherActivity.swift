import Foundation

/// Swift mirror of the web `watch_together_activity` LiveKit data message
/// (`clients/web/src/audio/voiceData/watchTogetherActivity.ts`). Decoded for followers;
/// `EchoWatchTogetherWire` encodes the same shape for the Echo+ host (`EchoWatchTogetherHost`).

/// Mirrors `WATCH_TOGETHER_VC_ACTIVITY_ENABLED` in `contracts/integrationKillSwitches.ts`.
/// While off web hides the Watch Together card, so Apple must not offer it either.
/// Flip together with the contract.
enum EchoWatchTogether {
  static let isEnabled = true
}

struct EchoWatchTogetherEntry: Equatable, Sendable {
  var id: String
  var title: String
  var sourcePublicURL: String
  var hlsManifestURL: String?
  var transcodeStatus: String
  /// Carried so the host can re-publish rows (web requires `storageKey` + `byteLength`).
  var storageKey = ""
  var byteLength = 0
  var transcodeError: String?

  private static let statuses: Set<String> = [
    "uploading", "pending", "processing", "ready", "failed",
  ]

  /// Host may start / jump to it only once the HLS transcode is ready (web `rowIsPlayable`).
  var isPlayable: Bool {
    transcodeStatus == "ready" && !(hlsManifestURL?.trimmingCharacters(in: .whitespaces).isEmpty ?? true)
  }

  var isSettled: Bool { transcodeStatus == "ready" || transcodeStatus == "failed" }

  /// HLS once the transcode is ready (web `hasPlayableHls`), otherwise the raw upload.
  /// Relative API paths resolve against `baseURL`; only http(s) URLs are returned.
  func playbackURL(baseURL: URL) -> URL? {
    let hls = hlsManifestURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let raw = transcodeStatus == "ready" && !hls.isEmpty ? hls : sourcePublicURL
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, transcodeStatus != "failed",
      let url = URL(string: trimmed, relativeTo: trimmed.hasPrefix("/") ? baseURL : nil)?
        .absoluteURL
    else { return nil }
    return EchoURLPolicy.isAllowedFetchScheme(url) ? url : nil
  }

  /// Rows missing any required field are dropped (web `parseWatchTogetherPlaylistEntry`).
  fileprivate struct Wire: Decodable {
    var id: String
    var storageKey: String
    var sourcePublicUrl: String
    var hlsManifestUrl: String?
    var title: String
    var transcodeStatus: String
    var transcodeError: String?
    var byteLength: Double

    var entry: EchoWatchTogetherEntry? {
      guard EchoWatchTogetherEntry.statuses.contains(transcodeStatus) else { return nil }
      return EchoWatchTogetherEntry(
        id: id, title: title, sourcePublicURL: sourcePublicUrl, hlsManifestURL: hlsManifestUrl,
        transcodeStatus: transcodeStatus, storageKey: storageKey,
        byteLength: byteLength.isFinite ? Int(byteLength) : 0, transcodeError: transcodeError)
    }
  }
}

struct EchoWatchTogetherActivity: Equatable, Sendable {
  var updatedAt: Double
  var fromUserID: String
  var fromName: String?
  var sessionID: String
  /// `closed`, `pick`, or `watch_together`.
  var activityPhase: String
  var sessionStarted: Bool
  var playlist: [EchoWatchTogetherEntry]
  var currentIndex: Int
  var playback: EchoYoutubePlaybackSync?

  var isWatchTogetherPhase: Bool { activityPhase == "watch_together" }

  var currentEntry: EchoWatchTogetherEntry? {
    playlist.indices.contains(currentIndex) ? playlist[currentIndex] : nil
  }

  private static let phases: Set<String> = ["closed", "pick", "watch_together"]

  static func decode(_ data: Data) -> EchoWatchTogetherActivity? {
    guard let wire = try? JSONDecoder().decode(Wire.self, from: data) else { return nil }
    return wire.activity
  }

  private struct Wire: Decodable {
    var updatedAt: Double
    var fromUserId: String
    var fromName: String?
    var sessionId: String
    var activityPhase: String
    var sessionStarted: Bool
    var playlist: [Lossy]
    var currentIndex: Double
    var wtPlayback: EchoYoutubePlaybackSync?

    private enum Keys: String, CodingKey {
      case updatedAt, fromUserId, fromName, sessionId, activityPhase, sessionStarted, playlist
      case currentIndex, wtPlayback, browseOpen
    }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: Keys.self)
      updatedAt = try c.decode(Double.self, forKey: .updatedAt)
      fromUserId = try c.decode(String.self, forKey: .fromUserId)
      fromName = try? c.decodeIfPresent(String.self, forKey: .fromName)
      sessionId = try c.decode(String.self, forKey: .sessionId)
      activityPhase = try c.decode(String.self, forKey: .activityPhase)
      sessionStarted = try c.decode(Bool.self, forKey: .sessionStarted)
      playlist = try c.decode([Lossy].self, forKey: .playlist)
      currentIndex = try c.decode(Double.self, forKey: .currentIndex)
      _ = try c.decode(Bool.self, forKey: .browseOpen)
      // A malformed or `null` sample is dropped without invalidating the message.
      wtPlayback = try? c.decodeIfPresent(EchoYoutubePlaybackSync.self, forKey: .wtPlayback)
    }

    var activity: EchoWatchTogetherActivity? {
      let from = fromUserId.trimmingCharacters(in: .whitespaces)
      guard !from.isEmpty, !sessionId.trimmingCharacters(in: .whitespaces).isEmpty,
        EchoWatchTogetherActivity.phases.contains(activityPhase),
        currentIndex.isFinite, currentIndex >= 0, currentIndex == currentIndex.rounded()
      else { return nil }
      let rows = playlist.compactMap(\.entry)
      let index = Int(currentIndex)
      guard rows.isEmpty || index < rows.count else { return nil }
      return EchoWatchTogetherActivity(
        updatedAt: updatedAt, fromUserID: from, fromName: fromName, sessionID: sessionId,
        activityPhase: activityPhase, sessionStarted: sessionStarted, playlist: rows,
        currentIndex: rows.isEmpty ? 0 : index, playback: wtPlayback)
    }
  }

  private struct Lossy: Decodable {
    var entry: EchoWatchTogetherEntry?
    init(from decoder: Decoder) throws {
      entry = (try? EchoWatchTogetherEntry.Wire(from: decoder))?.entry
    }
  }
}
