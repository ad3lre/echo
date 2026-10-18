import SwiftUI

struct EchoPresenceIndicator: View {
  let status: String?
  var size: CGFloat = 13
  /// Surface behind the badge — used for idle/dnd cutouts and the avatar halo.
  var borderColor = EchoTheme.Color.canvas
  /// When false, skip the outer halo (list rows that already sit on flat chrome).
  var showsHalo = true
  @Environment(\.colorScheme) private var colorScheme

  private var canonicalStatus: String {
    switch status?.lowercased() {
    case "dnd", "busy": "do_not_disturb"
    default: status?.lowercased() ?? "offline"
    }
  }

  private var color: Color {
    switch canonicalStatus {
    case "online": EchoTheme.Color.presenceOnline
    case "idle": EchoTheme.Color.presenceIdle
    case "do_not_disturb": EchoTheme.Color.presenceDnd
    default: EchoTheme.Color.presenceOffline
    }
  }

  /// Halo punches the badge out of the avatar. Keep it thinner in light mode so
  /// it reads as a cutout, not a hard outline ring.
  private var haloWidth: CGFloat {
    let ratio = colorScheme == .light ? 0.16 : 0.22
    return max(colorScheme == .light ? 1.5 : 2, size * ratio)
  }

  var body: some View {
    ZStack {
      Circle().fill(color)
      if canonicalStatus == "idle" {
        Circle()
          .fill(borderColor)
          .frame(width: size * 0.54, height: size * 0.54)
          .offset(x: -size * 0.18, y: -size * 0.18)
      } else if canonicalStatus == "do_not_disturb" {
        Capsule()
          .fill(borderColor)
          .frame(width: size * 0.62, height: max(2, size * 0.18))
      }
    }
    .frame(width: size, height: size)
    .overlay {
      if showsHalo {
        Circle().stroke(borderColor, lineWidth: haloWidth)
      }
    }
    .accessibilityLabel(accessibilityLabel)
  }

  private var accessibilityLabel: String {
    switch canonicalStatus {
    case "online": EchoCopy.string("Online")
    case "idle": EchoCopy.string("Idle")
    case "do_not_disturb": EchoCopy.string("Do Not Disturb")
    default: EchoCopy.string("Offline")
    }
  }
}

#if DEBUG
  #Preview("Presence") {
    HStack(spacing: 16) {
      ForEach(["online", "idle", "do_not_disturb", "offline"], id: \.self) { status in
        EchoPresenceIndicator(status: status, size: 18)
      }
    }
    .padding()
    .background(EchoTheme.Color.canvas)
  }
#endif
