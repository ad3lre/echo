import SwiftUI

/// Speaking ring used on member avatars and voice tiles (web occupancy parity).
struct EchoVoiceIndicator: View {
  var isSpeaking: Bool
  var size: CGFloat = 44

  var body: some View {
    Circle()
      .stroke(EchoTheme.Color.signInBlue, lineWidth: isSpeaking ? 2.4 : 0)
      .frame(width: size + 6, height: size + 6)
      .opacity(isSpeaking ? 1 : 0)
      .animation(.easeOut(duration: 0.12), value: isSpeaking)
  }
}

struct EchoVoiceAvatar: View {
  let name: String
  let userID: String
  let avatarURL: String?
  let baseURL: URL
  var accessToken: String? = nil
  var isSpeaking: Bool
  var size: CGFloat = 40

  var body: some View {
    ZStack {
      EchoVoiceIndicator(isSpeaking: isSpeaking, size: size)
      EchoMediaImage(source: avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: name, seed: userID)
      }
      .frame(width: size, height: size)
      .clipShape(Circle())
    }
    .frame(width: size + 8, height: size + 8)
  }
}
