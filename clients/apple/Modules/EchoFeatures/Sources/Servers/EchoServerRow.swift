import EchoDomain
import EchoNetworking
import SwiftUI

struct EchoServerRow: View {
  let server: EchoServerSummary
  let baseURL: URL
  var accessToken: String? = nil
  var isStarred = false

  @State private var attentionSync = EchoAttentionSync.shared

  private var railAttention: EchoServerRailAttention {
    let _ = attentionSync.snapshot.unreadCount
    return EchoAttentionPingIndicators.indicators(
      for: server.id, snapshot: attentionSync.snapshot)
  }

  var body: some View {
    HStack(spacing: 14) {
      EchoServerIcon(
        iconURL: server.iconURL,
        name: server.name,
        baseURL: baseURL,
        accessToken: accessToken,
        bannerURL: server.bannerURL
      )
      .frame(width: 48, height: 48)
      .overlay {
        EchoServerRailAttentionOverlay(
          attention: railAttention, iconSide: 48, bubbleTrailing: true)
      }
      .overlay(alignment: .topLeading) {
        if railAttention.plainUnread, railAttention.bubble == nil,
          railAttention.channelDots.isEmpty
        {
          Circle()
            .fill(Color.white)
            .frame(width: 9, height: 9)
            .overlay(Circle().stroke(EchoTheme.Color.canvas, lineWidth: 2))
            .offset(x: -1, y: -1)
            .accessibilityHidden(true)
        }
      }

      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(server.name)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(
              railAttention.plainUnread || railAttention.bubble != nil
                || !railAttention.channelDots.isEmpty
                ? EchoTheme.Color.ink(0.97) : EchoTheme.Color.ink(0.94)
            )
            .lineLimit(1)
          if isStarred {
            Image(systemName: "star.fill")
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(EchoTheme.Color.serverStarAccent)
              .accessibilityLabel(EchoCopy.string("Starred"))
          }
        }
        if let description = server.description, !description.isEmpty {
          Text(description)
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(2)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 6)
    .echoPointerHoverFill(cornerRadius: 12)
  }
}
