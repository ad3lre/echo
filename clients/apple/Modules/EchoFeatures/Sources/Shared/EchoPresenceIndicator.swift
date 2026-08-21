import SwiftUI

struct EchoPresenceIndicator: View {
  let status: String?
  var size: CGFloat = 13
  var borderColor = EchoTheme.Color.canvas

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
    .overlay(Circle().stroke(borderColor, lineWidth: max(2, size * 0.22)))
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

