import EchoDomain
import Observation
import SwiftUI

/// Session acknowledgments for NSFW channel gates (web `nsfwAcknowledgedChannelIds`).
@MainActor
@Observable
final class EchoNsfwChannelGateSession {
  static let shared = EchoNsfwChannelGateSession()

  private(set) var acknowledgedIDs: Set<String> = []

  func isAcknowledged(_ channelID: String) -> Bool {
    acknowledgedIDs.contains(channelID)
  }

  func acknowledge(_ channelID: String) {
    let id = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    acknowledgedIDs.insert(id)
  }

}

/// First non-NSFW text channel, else first text channel (web `declineNsfwGate`).
enum EchoNsfwChannelGate {
  static func declineTarget(
    among channels: [EchoGuildChannel], excluding currentID: String
  ) -> EchoGuildChannel? {
    let listable = channels.filter { channel in
      channel.isListable && channel.id != currentID && !channel.isForumPost
    }
    if let safe = listable.first(where: { $0.isTextLike && !$0.nsfw }) { return safe }
    return listable.first(where: \.isTextLike)
  }
}

/// Full-bleed age gate over NSFW guild surfaces (web `ChatView` NSFW overlay).
struct EchoNsfwChannelGateOverlay: View {
  var onEnter: () -> Void
  var onDecline: (() -> Void)? = nil

  var body: some View {
    ZStack {
      EchoTheme.Color.canvas.opacity(0.72)
        .background(.ultraThinMaterial)
        .ignoresSafeArea()
      VStack(spacing: 16) {
        Text(EchoCopy.string("Age-restricted channel"))
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.96))
          .multilineTextAlignment(.center)
        Text(
          EchoCopy.string(
            "This channel is marked as NSFW. By continuing you confirm you are 18 or older and choose to view potentially mature content."
          )
        )
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 12) {
          if let onDecline {
            Button(EchoCopy.string("Go back"), action: onDecline)
              .buttonStyle(.bordered)
          }
          Button(EchoCopy.string("Enter channel"), action: onEnter)
            .buttonStyle(.borderedProminent)
            .tint(EchoTheme.Color.badge)
        }
        .padding(.top, 4)
      }
      .padding(28)
      .frame(maxWidth: 420)
    }
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
  }
}

/// Gates NSFW channel content until the user confirms (session-scoped).
struct EchoNsfwGatedSurface<Content: View>: View {
  let channel: EchoGuildChannel
  var onDecline: (() -> Void)? = nil
  @ViewBuilder var content: () -> Content
  @State private var session = EchoNsfwChannelGateSession.shared

  private var needsGate: Bool {
    channel.nsfw && !session.isAcknowledged(channel.id)
  }

  var body: some View {
    ZStack {
      content()
        .allowsHitTesting(!needsGate)
      if needsGate {
        EchoNsfwChannelGateOverlay(
          onEnter: { session.acknowledge(channel.id) },
          onDecline: onDecline
        )
        .transition(.opacity)
      }
    }
  }
}
