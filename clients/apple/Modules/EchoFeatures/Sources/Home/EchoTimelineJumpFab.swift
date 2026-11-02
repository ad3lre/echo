import SwiftUI

/// Web `MessageListJumpFab` — center-bottom control to return to the live tail.
struct EchoTimelineJumpFab: View {
  let pendingNewWhileAway: Int
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Text(EchoCopy.string("Jump to latest"))
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
          .lineLimit(1)
        if let badge = EchoTimelineJumpUi.badgeLabel(pendingNewWhileAway: pendingNewWhileAway) {
          Text(verbatim: badge)
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(EchoTheme.Color.indigo.opacity(0.28), in: RoundedRectangle(cornerRadius: 6))
        }
        Image(systemName: "arrow.down")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.88))
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .background {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(EchoTheme.Color.canvas.opacity(0.88))
          .background {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .fill(.ultraThinMaterial)
          }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(EchoTheme.Color.hairline, lineWidth: 1)
      }
      .echoShadow(color: EchoTheme.Color.ink(0.22), radius: 16, y: 6)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      EchoTimelineJumpUi.accessibilityLabel(pendingNewWhileAway: pendingNewWhileAway))
  }
}
