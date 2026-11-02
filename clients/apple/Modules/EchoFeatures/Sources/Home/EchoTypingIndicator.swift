import SwiftUI

/// Web `ChatTypingIndicator` — avatar stack + 1/2/many label + bounce dots.
struct EchoTypingIndicator: View {
  let users: [EchoTypingUser]
  var baseURL: URL? = nil
  var accessToken: String? = nil

  private var stack: [EchoTypingUser] { Array(users.prefix(3)) }
  private var overflow: Int { max(0, users.count - 3) }

  var body: some View {
    if !users.isEmpty {
      HStack(spacing: 10) {
        avatarStack
        Text(EchoChannelTyping.label(for: users))
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .lineLimit(1)
        typingDots
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 22)
      .padding(.bottom, 4)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(EchoChannelTyping.label(for: users))
    }
  }

  private var avatarStack: some View {
    HStack(spacing: -8) {
      ForEach(Array(stack.enumerated()), id: \.element.id) { index, user in
        typingAvatar(user)
          .zIndex(Double(10 - index))
      }
      if overflow > 0 {
        Text(verbatim: "+\(overflow)")
          .font(.system(size: 9, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 22, height: 22)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
          .overlay { Circle().stroke(EchoTheme.Color.canvas, lineWidth: 2) }
          .zIndex(1)
      }
    }
  }

  @ViewBuilder
  private func typingAvatar(_ user: EchoTypingUser) -> some View {
    Group {
      if let url = user.avatarURL, let baseURL, !url.isEmpty {
        EchoMediaImage(source: url, baseURL: baseURL, accessToken: accessToken, maxPixelSize: 48) {
          EchoGeneratedAvatar(name: user.displayName, seed: user.userID)
        }
        .scaledToFill()
      } else {
        EchoGeneratedAvatar(name: user.displayName, seed: user.userID)
      }
    }
    .frame(width: 22, height: 22)
    .clipShape(Circle())
    .overlay { Circle().stroke(EchoTheme.Color.canvas, lineWidth: 2) }
  }

  private var typingDots: some View {
    TimelineView(.animation(minimumInterval: 0.15, paused: false)) { context in
      let phase = Int(context.date.timeIntervalSinceReferenceDate * 6.5) % 3
      HStack(spacing: 3) {
        ForEach(0..<3, id: \.self) { i in
          Circle()
            .fill(EchoTheme.Color.ink(i == phase ? 0.55 : 0.22))
            .frame(width: 4, height: 4)
            .offset(y: i == phase ? -2 : 0)
        }
      }
    }
    .accessibilityHidden(true)
  }
}
