import EchoDomain
import SwiftUI

struct EchoConversationHeader: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let isPersonalNotes: Bool
  let onExit: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Button(action: onExit) {
        Image(systemName: "arrow.left")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(.white.opacity(0.88))
          .frame(width: 38, height: 38)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close conversation"))

      Button(action: {}) {
        HStack(spacing: 9) {
          EchoMediaImage(
            source: conversation.avatarURL, baseURL: baseURL, accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: conversation.displayName, seed: conversation.channelID)
          }
          .clipShape(Circle())
          .frame(width: 34, height: 34)
          .overlay(alignment: .bottomTrailing) {
            if !isPersonalNotes {
              EchoPresenceIndicator(status: conversation.presenceStatus, size: 11)
            }
          }

          VStack(alignment: .leading, spacing: 1) {
            Text(conversation.displayName)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            if let username = conversation.username, !username.isEmpty {
              Text("@\(username)")
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.42))
                .lineLimit(1)
            }
          }

          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.34))
            .padding(.leading, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Open %@ profile", conversation.displayName))
      .accessibilityHint(EchoCopy.string("Profile view coming soon"))

      HStack(spacing: 4) {
        if !isPersonalNotes {
          conversationAction("phone.fill", label: EchoCopy.string("Call"))
        }
        conversationAction("pin.fill", label: EchoCopy.string("Pinned messages"), size: 13)
        conversationAction("magnifyingglass", label: EchoCopy.string("Search messages"))
      }
    }
    .padding(.horizontal, 14)
    .padding(.top, 14)
    .padding(.bottom, 14)
    .background {
      EchoTheme.Color.canvas
        .ignoresSafeArea(edges: .top)
    }
  }

  private func conversationAction(
    _ systemName: String,
    label: String,
    size: CGFloat = 16
  ) -> some View {
    Button(action: {}) {
      Image(systemName: systemName)
        .font(.system(size: size, weight: .medium))
        .foregroundStyle(.white.opacity(0.68))
        .frame(width: 31, height: 34)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
    .accessibilityHint(EchoCopy.string("Available soon"))
  }
}

struct EchoOlderMessagesErrorBanner: View {
  let message: String
  let retry: () async -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.orange.opacity(0.9))
      Text(message)
        .font(.system(size: 12, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.62))
        .lineLimit(2)
      Spacer(minLength: 4)
      Button(EchoCopy.string("Retry")) {
        Task { await retry() }
      }
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(.white.opacity(0.88))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity)
    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .padding(.bottom, 8)
  }
}

struct EchoConversationErrorView: View {
  let message: String
  let retry: () async -> Void

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 22, weight: .medium))
        .foregroundStyle(.white.opacity(0.55))
      Text(message)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.58))
        .multilineTextAlignment(.center)
      Button(EchoCopy.string("Try again")) {
        Task { await retry() }
      }
      .buttonStyle(.borderedProminent)
      .tint(.indigo)
    }
    .frame(maxWidth: .infinity)
  }
}

struct EchoConversationBackground: View {
  var body: some View {
    ZStack {
      EchoTheme.Color.canvas
      RadialGradient(
        colors: [Color.indigo.opacity(0.18), .clear],
        center: UnitPoint(x: 0.92, y: 0.02),
        startRadius: 0,
        endRadius: 360
      )
    }
  }
}
