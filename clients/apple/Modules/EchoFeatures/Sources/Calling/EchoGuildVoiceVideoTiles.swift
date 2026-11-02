import EchoDomain
import LiveKit
import SwiftUI

/// One screen-share or camera surface in the guild voice grid.
struct EchoGuildVideoTile: View {
  let track: VideoTrack
  let name: String
  var isScreen = false
  var isLocal = false
  var isSpeaking = false

  var body: some View {
    SwiftUIVideoView(
      track,
      layoutMode: isScreen ? .fit : .fill,
      mirrorMode: isLocal && !isScreen ? .mirror : .auto
    )
    .aspectRatio(isScreen ? 16 / 9 : 4 / 3, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .background(Color.black.opacity(isScreen ? 0.9 : 0.4))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(alignment: .bottomLeading) { label }
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(isSpeaking ? EchoTheme.Color.signInBlue.opacity(0.55) : Color.clear, lineWidth: 2)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityName)
  }

  private var label: some View {
    HStack(spacing: 4) {
      if isScreen {
        Image(systemName: "rectangle.on.rectangle").font(.system(size: 10, weight: .semibold))
      }
      Text(name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
    }
    .foregroundStyle(Color.white)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Color.black.opacity(0.55), in: Capsule())
    .padding(8)
  }

  private var accessibilityName: String {
    isScreen ? EchoCopy.format("%@ is sharing their screen", name) : name
  }
}

/// A participant's shared screen (local or remote), shown full-width above the grid.
struct EchoGuildScreenShare: Identifiable {
  let id: String
  let track: VideoTrack
  let name: String
  let isLocal: Bool
}

extension EchoGuildVoiceSession {
  /// Screen shares first (local, then remote), resolving display names via `name`.
  func screenShares(
    currentUserID: String, name: (String) -> String
  ) -> [EchoGuildScreenShare] {
    var out: [EchoGuildScreenShare] = []
    if let track = localScreenTrack {
      out.append(
        EchoGuildScreenShare(
          id: "local-screen", track: track, name: EchoCopy.string("You"), isLocal: true))
    }
    for tile in remoteVideoTiles {
      guard let track = tile.screen else { continue }
      out.append(
        EchoGuildScreenShare(
          id: "screen-\(tile.identity)", track: track, name: name(tile.identity), isLocal: false))
    }
    return out
  }

  /// Camera feed for a roster member (local when it is the viewer, else remote).
  func cameraTrack(for userID: String, currentUserID: String) -> (VideoTrack, isLocal: Bool)? {
    if EchoUserIdentity.matches(userID, currentUserID), let track = localCameraTrack {
      return (track, true)
    }
    if let track = remoteTile(for: userID)?.camera { return (track, false) }
    return nil
  }
}
