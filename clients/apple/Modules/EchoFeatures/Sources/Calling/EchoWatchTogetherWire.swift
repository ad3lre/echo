import Foundation

/// Encoder for the host's `watch_together_activity` message; field names and the `v: 1`
/// envelope match `buildWatchTogetherActivityPayload` / `encodeEchoWatchTogetherActivity`.
extension EchoGuildVoiceWire {
  static func watchTogether(
    userID: String,
    name: String?,
    sessionID: String,
    phase: String,
    started: Bool,
    playlist: [EchoWatchTogetherEntry],
    currentIndex: Int,
    playback: EchoYoutubePlaybackSync? = nil,
    now: Date = Date()
  ) -> Data {
    let inSession = phase == "watch_together"
    var payload: [String: Any] = [
      "v": 1, "t": "watch_together_activity", "updatedAt": millis(now), "fromUserId": userID,
      "sessionId": sessionID, "activityPhase": phase, "sessionStarted": inSession && started,
      "playlist": inSession ? playlist.map(watchTogetherRow) : [],
      "currentIndex": inSession ? currentIndex : 0, "browseOpen": false,
    ]
    if let name = name?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
      payload["fromName"] = name
    }
    if inSession, let playback {
      payload["wtPlayback"] = [
        "playing": playback.playing, "mediaTimeSec": playback.mediaTimeSec,
        "wallMs": playback.wallMs,
      ]
    }
    return encode(payload)
  }

  private static func watchTogetherRow(_ entry: EchoWatchTogetherEntry) -> [String: Any] {
    var row: [String: Any] = [
      "id": entry.id, "storageKey": entry.storageKey, "sourcePublicUrl": entry.sourcePublicURL,
      "hlsManifestUrl": entry.hlsManifestURL ?? NSNull(), "title": entry.title,
      "transcodeStatus": entry.transcodeStatus, "byteLength": entry.byteLength,
    ]
    if let error = entry.transcodeError { row["transcodeError"] = error }
    return row
  }
}
