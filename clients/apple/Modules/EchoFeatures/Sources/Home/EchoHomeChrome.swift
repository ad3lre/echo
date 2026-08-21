import EchoDomain
import SwiftUI

struct EchoHomeBackground: View {
  var body: some View {
    ZStack {
      EchoTheme.Color.canvas
      RadialGradient(
        colors: [EchoTheme.Color.ambientIndigo.opacity(0.22), .clear],
        center: UnitPoint(x: 0.88, y: 0.03),
        startRadius: 0,
        endRadius: 290
      )
    }
  }
}

struct EchoProfileHeader: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  let presenceStatus: String
  let onProfileTap: () -> Void
  let onMenuTap: () -> Void

  var body: some View {
    Button(action: onProfileTap) {
      VStack(spacing: 0) {
        ZStack(alignment: .bottom) {
          EchoProfileBanner(profile: profile, baseURL: baseURL, accessToken: accessToken)
            // Extend the artwork beneath the curve so raster/remote-image
            // edges can never form a hairline seam at the section boundary.
            .frame(height: 226)

          EchoHeaderSlice()
            .fill(EchoTheme.Color.canvas)
            .frame(height: 84)

          HStack(alignment: .bottom, spacing: 14) {
            EchoProfileAvatar(
              profile: profile, baseURL: baseURL, accessToken: accessToken,
              presenceStatus: presenceStatus
            )
            .frame(width: 76, height: 76)

            VStack(alignment: .leading, spacing: 3) {
              Text(profile.name)
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
              Text(profile.username.map { "@\($0)" } ?? "")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
            }
            .padding(.bottom, 7)

            Spacer(minLength: 0)

            Button(action: onMenuTap) {
              Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white.opacity(0.46))
                .frame(width: 42, height: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.bottom, 7)
          }
          .padding(.horizontal, 22)
        }
        .background(EchoTheme.Color.canvas)
        .clipped()
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("Open profile for %@", profile.name))
  }
}

struct EchoProfileBanner: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    ZStack {
      if let bannerURL = profile.bannerURL,
        !bannerURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        EchoMediaImage(source: profile.bannerURL, baseURL: baseURL, accessToken: accessToken) {
          fallbackColor.overlay(ProgressView().tint(.white.opacity(0.55)))
        }
      } else {
        fallbackColor
      }
      LinearGradient(
        colors: [.black.opacity(0.02), .black.opacity(0.42)],
        startPoint: .top,
        endPoint: .bottom
      )
    }
    .clipped()
  }

  private var fallbackColor: some View {
    Color(hex: profile.bannerColor) ?? Color.white.opacity(0.08)
  }
}

struct EchoHeaderSlice: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: rect.midY - 8),
      control1: CGPoint(x: rect.width * 0.27, y: rect.minY - 4),
      control2: CGPoint(x: rect.width * 0.70, y: rect.maxY + 8)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

struct EchoProfileAvatar: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  var presenceStatus: String? = nil

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if let avatarURL = profile.avatarURL,
        !avatarURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        EchoMediaImage(source: profile.avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: profile.name, seed: profile.name)
        }
        .clipShape(Circle())
      } else {
        EchoGeneratedAvatar(name: profile.name, seed: profile.name)
      }
      if presenceStatus != nil {
        EchoPresenceIndicator(status: presenceStatus, size: 16)
      }
    }
    .shadow(color: .black.opacity(0.32), radius: 14, y: 8)
  }

}

struct EchoDirectMessageList: View {
  let conversations: [EchoDirectMessage]
  @Binding var searchText: String
  let baseURL: URL
  var accessToken: String? = nil
  let onRefresh: () async -> Void
  let onOpen: (EchoDirectMessage) -> Void
  let inboxNotificationCount: Int
  let onOpenInbox: () -> Void
  @State private var hasScrolled = false

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white.opacity(0.42))
          TextField(EchoCopy.string("Search conversations"), text: $searchText)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(.white)
            .tint(.white)
            .textFieldStyle(.plain)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
          .white.opacity(0.065), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.white.opacity(0.08))
        )

        EchoHomeActionButton(
          systemName: "tray.fill",
          accessibilityLabel: EchoCopy.string("Inbox"),
          notificationCount: inboxNotificationCount,
          action: onOpenInbox
        )
      }
      .padding(.horizontal, 22)
      .padding(.top, 24)
      .padding(.bottom, 17)

      ZStack(alignment: .top) {
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0) {
            if conversations.isEmpty {
              Text(
                searchText.isEmpty
                  ? EchoCopy.string("No conversations yet.")
                  : EchoCopy.string("No conversations found.")
              )
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.46))
                .padding(.horizontal, 24)
                .padding(.top, 18)
            } else {
              ForEach(conversations) { conversation in
                EchoDirectMessageRow(
                  conversation: conversation,
                  baseURL: baseURL,
                  accessToken: accessToken,
                  onTap: { onOpen(conversation) }
                )
              }
            }
          }
          .padding(.bottom, 28)
          .background {
            GeometryReader { proxy in
              Color.clear.preference(
                key: EchoDirectMessageScrollOffsetKey.self,
                value: proxy.frame(in: .named("echo-direct-messages-scroll")).minY
              )
            }
          }
        }
        .coordinateSpace(name: "echo-direct-messages-scroll")
        .refreshable {
          await onRefresh()
        }

        LinearGradient(
          colors: [
            EchoTheme.Color.canvas,
            EchoTheme.Color.canvas.opacity(0),
          ],
          startPoint: .top,
          endPoint: .bottom
        )
        .frame(height: 18)
        .opacity(hasScrolled ? 1 : 0)
        .allowsHitTesting(false)
      }
      .frame(maxHeight: .infinity)
      .onPreferenceChange(EchoDirectMessageScrollOffsetKey.self) { offset in
        hasScrolled = offset < -4
      }
    }
  }
}

struct EchoHomeActionButton: View {
  let systemName: String
  let accessibilityLabel: String
  var notificationCount = 0
  let action: () -> Void

  private var isHighlighted: Bool { notificationCount > 0 }

  var body: some View {
    Button(action: action) {
      ZStack(alignment: .topTrailing) {
        Image(systemName: systemName)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(isHighlighted ? .white : .white.opacity(0.82))
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        if isHighlighted {
          Text(notificationCount > 99 ? "99+" : String(notificationCount))
            .font(.system(size: notificationCount > 9 ? 8 : 10, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .padding(.horizontal, notificationCount > 9 ? 4 : 0)
            .frame(minWidth: 18, minHeight: 18)
            .background(EchoTheme.Color.badge, in: Capsule())
            .overlay(Capsule().stroke(EchoTheme.Color.badgeStroke, lineWidth: 2))
            .offset(x: 6, y: -6)
        }
      }
      .frame(width: 54, height: 48)
      .background(
        isHighlighted
          ? EchoTheme.Color.actionHighlight.opacity(0.92)
          : .white.opacity(0.065),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isHighlighted ? .white.opacity(0.19) : .white.opacity(0.08))
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      isHighlighted
        ? EchoCopy.format("%@, %lld notifications", accessibilityLabel, notificationCount)
        : accessibilityLabel
    )
    .accessibilityAddTraits(.isButton)
  }
}

struct EchoDirectMessageScrollOffsetKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

struct EchoDirectMessageRow: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      HStack(spacing: 13) {
        EchoConversationAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken
        )
        .frame(width: 52, height: 52)

        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 7) {
            Text(conversation.displayName)
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            Spacer(minLength: 0)
            if let date = conversation.lastMessageAt {
              Text(relativeDateLabel(date))
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.34))
            }
          }

          Text(
            conversation.lastMessage
              ?? (conversation.lastMessageAt == nil ? EchoCopy.string("No messages yet") : " ")
          )
            .font(.system(size: 14, weight: .regular, design: .rounded))
            .foregroundStyle(.white.opacity(0.48))
            .lineLimit(1)
        }
      }
      .padding(.horizontal, 22)
      .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(conversation.displayName)
    .accessibilityValue(
      conversation.lastMessage ?? EchoCopy.string("No messages yet")
    )
    .accessibilityHint(EchoCopy.string("Open conversation"))
  }
}

struct EchoConversationAvatar: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Circle().fill(Color.white.opacity(0.08))
      if conversation.avatarURLs.count > 1 {
        EchoGroupAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken)
      } else if conversation.avatarURL != nil {
        EchoMediaImage(
          source: conversation.avatarURL, baseURL: baseURL, accessToken: accessToken
        ) {
          EchoGeneratedAvatar(
            name: conversation.displayName,
            seed: conversation.displayName
          )
        }
        .clipShape(Circle())
      } else {
        EchoGeneratedAvatar(
          name: conversation.displayName,
          seed: conversation.displayName
        )
      }
      if conversation.avatarURLs.count <= 1 {
        EchoPresenceIndicator(status: conversation.presenceStatus, size: 14)
      }
    }
  }

}

struct EchoGroupAvatar: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size.width / 2
      LazyVGrid(
        columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible(), spacing: 1)], spacing: 1
      ) {
        ForEach(Array(conversation.avatarURLs.prefix(4).enumerated()), id: \.offset) {
          index, source in
          EchoMediaImage(source: source, baseURL: baseURL, accessToken: accessToken) {
            EchoGeneratedAvatar(
              name: conversation.displayName, seed: "\(conversation.channelID)-\(index)")
          }
          .frame(width: size, height: size)
          .clipped()
        }
      }
    }
    .clipShape(Circle())
  }
}

struct EchoHomeLoadingView: View {
  var body: some View {
    VStack(spacing: 18) {
      ProgressView().tint(.white.opacity(0.78)).scaleEffect(1.1)
      EchoCopy.text("Loading your Echo")
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.54))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

struct EchoHomeUnavailableView: View {
  let message: String
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 24, weight: .medium))
        .foregroundStyle(.white.opacity(0.58))
      Text(message)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.58))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 280)
      Button(EchoCopy.string("Try again"), action: retry)
        .buttonStyle(.borderedProminent)
        .tint(.indigo)
    }
    .frame(maxWidth: .infinity, minHeight: 520)
    .padding(28)
  }
}

@MainActor
func relativeDateLabel(_ date: Date) -> String {
  EchoRelativeDateFormatter.string(from: date)
}

@MainActor
enum EchoRelativeDateFormatter {
  private static let formatter = RelativeDateTimeFormatter()

  static func string(from date: Date) -> String {
    formatter.localizedString(for: date, relativeTo: Date())
  }
}

#if DEBUG
  #Preview("Home loading") {
    ZStack {
      EchoTheme.Color.canvas.ignoresSafeArea()
      EchoHomeLoadingView()
    }
  }

  #Preview("Home unavailable") {
    ZStack {
      EchoTheme.Color.canvas.ignoresSafeArea()
      EchoHomeUnavailableView(message: EchoCopy.string("Couldn’t reach Echo.")) {}
    }
  }
#endif

