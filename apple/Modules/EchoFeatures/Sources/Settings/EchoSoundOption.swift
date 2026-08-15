import Foundation

enum EchoSoundOption: String, CaseIterable, Identifiable {
  case streamingOn = "streamStart"
  case streamingOff = "streamEnd"
  case cameraOn = "videoStart"
  case cameraOff = "videoEnd"
  case streamJoin = "streamJoinSelf"
  case streamViewerArrive = "streamViewerArrive"
  case joinVoice = "joinVoiceChannel"
  case streamLeave = "streamViewerLeave"
  case pushToTalkOn = "pttOn"
  case pushToTalkOff = "pttOff"
  case mute = "vcMute"
  case unmute = "vcUnmute"
  case deafen = "vcDeafen"
  case undeafen = "vcUndeafen"
  case activePing = "pingActive"
  case directMention = "pingDirectMention"
  case dmPing = "pingDm"
  case everyonePing = "pingEveryone"
  case leaveVoice = "leaveVc"
  var id: String { rawValue }
  var group: EchoSoundGroup {
    switch self {
    case .streamingOn, .streamingOff, .cameraOn, .cameraOff, .streamJoin,
      .streamViewerArrive, .streamLeave:
      .media
    case .joinVoice, .pushToTalkOn, .pushToTalkOff, .mute, .unmute, .deafen, .undeafen,
      .leaveVoice:
      .voice
    case .activePing, .directMention, .dmPing, .everyonePing:
      .messages
    }
  }
  var icon: String {
    switch self {
    case .streamingOn, .streamingOff: "rectangle.inset.filled.and.person.filled"
    case .cameraOn, .cameraOff: "video.fill"
    case .streamJoin, .streamViewerArrive: "person.wave.2.fill"
    case .streamLeave: "person.wave.2"
    case .joinVoice, .leaveVoice: "phone.connection.fill"
    case .pushToTalkOn, .pushToTalkOff: "dot.radiowaves.left.and.right"
    case .mute, .unmute: "mic.fill"
    case .deafen, .undeafen: "speaker.slash.fill"
    case .activePing: "bell.and.waves.left.and.right.fill"
    case .directMention: "at"
    case .dmPing: "bubble.left.fill"
    case .everyonePing: "megaphone.fill"
    }
  }
  var title: String {
    switch self {
    case .streamingOn: return "Streaming started"
    case .streamingOff: return "Streaming ended"
    case .cameraOn: return "Camera enabled"
    case .cameraOff: return "Camera disabled"
    case .streamJoin: return "Stream viewer joined"
    case .streamViewerArrive: return "Stream viewer arrived"
    case .joinVoice: return "Joined voice channel"
    case .streamLeave: return "Stream viewer left"
    case .pushToTalkOn: return "Push to talk started"
    case .pushToTalkOff: return "Push to talk ended"
    case .mute: return "Muted"
    case .unmute: return "Unmuted"
    case .deafen: return "Deafened"
    case .undeafen: return "Undeafened"
    case .activePing: return "Active ping"
    case .directMention: return "Direct mention"
    case .dmPing: return "Direct message"
    case .everyonePing: return "Everyone mention"
    case .leaveVoice: return "Left voice channel"
    }
  }
}

enum EchoSoundGroup: String, CaseIterable, Identifiable {
  case media, voice, messages
  var id: String { rawValue }
  var title: String {
    switch self {
    case .media: "Streaming & camera"
    case .voice: "Voice controls"
    case .messages: "Messages & mentions"
    }
  }
}
