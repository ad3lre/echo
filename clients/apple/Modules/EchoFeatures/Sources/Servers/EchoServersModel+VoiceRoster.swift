import EchoDomain
import Foundation

enum EchoVoiceRosterDelta {
  /// Pure channel-list patch for `voice_roster_delta` (web ephemeral map).
  static func apply(
    to channels: [EchoGuildChannel],
    channelID: String,
    userID: String,
    action: String,
    fromChannelID: String? = nil,
    stageSpeaker: Bool? = nil
  ) -> [EchoGuildChannel]? {
    let cid = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    let uid = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    let act = action.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !cid.isEmpty, !uid.isEmpty else { return nil }
    var next = channels

    func index(of channelID: String) -> Int? {
      next.firstIndex { $0.id == channelID && $0.isVoiceLike }
    }
    func applyStageHint(at channelIndex: Int) -> Bool {
      guard next[channelIndex].isStage, let hint = stageSpeaker else { return false }
      var spk = next[channelIndex].voiceStageSpeakerByUserID
      if hint { spk[uid] = true } else { spk[uid] = nil }
      guard spk != next[channelIndex].voiceStageSpeakerByUserID else { return false }
      next[channelIndex] = next[channelIndex].withVoiceStageSpeaker(spk)
      return true
    }
    func removeUser(from channelIndex: Int) -> Bool {
      let ch = next[channelIndex]
      var ids = ch.voiceParticipantIDs
      var hadID = false
      if let i = ids.firstIndex(of: uid) {
        ids.remove(at: i)
        hadID = true
      }
      var mute = ch.voiceServerMuteByUserID
      let hadMute = mute.removeValue(forKey: uid) != nil
      var deaf = ch.voiceServerDeafenByUserID
      let hadDeaf = deaf.removeValue(forKey: uid) != nil
      var spk = ch.voiceStageSpeakerByUserID
      let hadSpk = spk.removeValue(forKey: uid) != nil
      guard hadID || hadMute || hadDeaf || hadSpk else { return false }
      var patched = ch
      if hadID { patched = patched.withVoiceParticipantIDs(ids) }
      if hadMute { patched = patched.withVoiceServerMute(mute) }
      if hadDeaf { patched = patched.withVoiceServerDeafen(deaf) }
      if hadSpk { patched = patched.withVoiceStageSpeaker(spk) }
      next[channelIndex] = patched
      return true
    }
    func addUser(to channelIndex: Int) -> Bool {
      var ids = next[channelIndex].voiceParticipantIDs
      guard !ids.contains(uid) else { return false }
      ids.append(uid)
      next[channelIndex] = next[channelIndex].withVoiceParticipantIDs(ids)
      return true
    }

    var changed = false
    switch act {
    case "join":
      if let i = index(of: cid) {
        if addUser(to: i) { changed = true }
        if applyStageHint(at: i) { changed = true }
      }
    case "leave", "disconnect":
      for i in next.indices where next[i].isVoiceLike {
        if removeUser(from: i) { changed = true }
      }
    case "move":
      for i in next.indices where next[i].isVoiceLike {
        if removeUser(from: i) { changed = true }
      }
      if let i = index(of: cid) {
        if addUser(to: i) { changed = true }
        if applyStageHint(at: i) { changed = true }
      }
      _ = fromChannelID
    case "mute", "unmute":
      guard let i = index(of: cid) else { return nil }
      var mute = next[i].voiceServerMuteByUserID
      let want = act == "mute"
      if want { mute[uid] = true } else { mute[uid] = nil }
      if mute == next[i].voiceServerMuteByUserID { return nil }
      next[i] = next[i].withVoiceServerMute(mute)
      changed = true
    case "deafen", "undeafen":
      guard let i = index(of: cid) else { return nil }
      var deaf = next[i].voiceServerDeafenByUserID
      let want = act == "deafen"
      if want { deaf[uid] = true } else { deaf[uid] = nil }
      if deaf == next[i].voiceServerDeafenByUserID { return nil }
      next[i] = next[i].withVoiceServerDeafen(deaf)
      changed = true
    case "promote_speaker", "demote_speaker":
      guard let i = index(of: cid), next[i].isStage else { return nil }
      var spk = next[i].voiceStageSpeakerByUserID
      let want = act == "promote_speaker"
      if want { spk[uid] = true } else { spk[uid] = nil }
      if spk == next[i].voiceStageSpeakerByUserID { return nil }
      next[i] = next[i].withVoiceStageSpeaker(spk)
      changed = true
    default:
      return nil
    }
    return changed ? next : nil
  }
}

extension EchoServersModel {
  /// Apply `voice_roster_delta` to cached channels (web `applyVoiceRosterDeltaToEphemeralMap`).
  @discardableResult
  func applyVoiceRosterDelta(
    serverID: String,
    channelID: String,
    userID: String,
    action: String,
    fromChannelID: String? = nil,
    stageSpeaker: Bool? = nil
  ) -> Bool {
    let sid = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, let channels = channelsByServer[sid], !channels.isEmpty else {
      return false
    }
    guard
      let next = EchoVoiceRosterDelta.apply(
        to: channels,
        channelID: channelID,
        userID: userID,
        action: action,
        fromChannelID: fromChannelID,
        stageSpeaker: stageSpeaker)
    else { return false }
    replaceChannels(next, for: sid)
    return true
  }

  /// Profile “in voice” rows for a member across hydrated servers.
  func voicePresences(
    for userID: String,
    preferServerID: String? = nil
  ) -> [EchoUserVoiceChannelPresence] {
    var avatars: [String: String] = [:]
    for members in membersByServer.values {
      for member in members {
        if let url = member.avatarURL, !url.isEmpty {
          avatars[member.userID] = url
        }
      }
    }
    return EchoUserVoiceChannelPresenceFinder.find(
      userID: userID,
      channelsByServer: channelsByServer,
      servers: servers,
      avatarURLByUserID: avatars,
      preferServerID: preferServerID
    )
  }
}
