import SwiftUI

struct EchoPresenceIndicator: View {
  let status: String?
  var size: CGFloat = 13
  var borderColor = Color(red: 0.008, green: 0.010, blue: 0.016)

  private var canonicalStatus: String {
    switch status?.lowercased() {
    case "dnd", "busy": "do_not_disturb"
    default: status?.lowercased() ?? "offline"
    }
  }

  private var color: Color {
    switch canonicalStatus {
    case "online": Color(red: 0.20, green: 0.86, blue: 0.51)
    case "idle": Color(red: 0.96, green: 0.68, blue: 0.22)
    case "do_not_disturb": Color(red: 0.94, green: 0.30, blue: 0.38)
    default: Color(red: 0.42, green: 0.44, blue: 0.50)
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
    case "online": "Online"
    case "idle": "Idle"
    case "do_not_disturb": "Do Not Disturb"
    default: "Offline"
    }
  }
}
