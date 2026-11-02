import Foundation
import Testing

@testable import EchoFeatures

struct EchoGuildVoiceActivityTests {
  private func data(_ json: String) -> Data { Data(json.utf8) }

  @Test func decodesYoutubeActivityWithPlayback() {
    let json = """
      {"v":1,"t":"youtube_activity","updatedAt":10,"fromUserId":"u1","activityPhase":"youtube",
       "playlist":[{"id":"dQw4w9WgXcQ","title":"T","channelTitle":"C","thumbnailUrl":null},{"bad":1}],
       "currentIndex":0,"youtubeBrowseOpen":false,
       "ytPlayback":{"playing":true,"mediaTimeSec":5,"wallMs":1000}}
      """
    guard case .youtube(let msg)? = EchoGuildVoiceData.decode(data(json)) else {
      Issue.record("expected youtube")
      return
    }
    #expect(msg.isYoutubePhase)
    #expect(msg.playlist.count == 1)
    #expect(msg.currentEntry?.id == "dQw4w9WgXcQ")
    #expect(msg.playback?.expectedMediaTime(now: Date(timeIntervalSince1970: 3)) == 7)
  }

  @Test func rejectsUnsafeVideoIDAndUnknownMessages() {
    let json = """
      {"v":1,"t":"youtube_activity","updatedAt":1,"fromUserId":"u1","activityPhase":"youtube",
       "playlist":[{"id":"x');alert(1)","title":"","channelTitle":""}],
       "currentIndex":0,"youtubeBrowseOpen":false}
      """
    guard case .youtube(let msg)? = EchoGuildVoiceData.decode(data(json)) else {
      Issue.record("expected youtube")
      return
    }
    #expect(msg.currentEntry == nil)
    #expect(EchoGuildVoiceData.decode(data(#"{"v":1,"t":"hangman"}"#)) == nil)
    #expect(EchoGuildVoiceData.decode(data("nope")) == nil)
  }

  @Test func decodesPresence() {
    let json = #"{"v":1,"t":"vc_activity_presence","updatedAt":2,"activities":["youtube","wordle"]}"#
    guard case .presence(let p)? = EchoGuildVoiceData.decode(data(json)) else {
      Issue.record("expected presence")
      return
    }
    #expect(p.activities == ["youtube", "wordle"])
  }
}
