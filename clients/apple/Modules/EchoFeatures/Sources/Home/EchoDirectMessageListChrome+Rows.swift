import EchoDomain
import SwiftUI

struct EchoDirectMessagePinnedRow: View {
  let systemName: String
  let title: String
  var subtitle: String? = nil
  var badge = 0
  var isSelected = false
  var usesAccentAvatar = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        ZStack {
          if usesAccentAvatar {
            Circle()
              .fill(
                LinearGradient(
                  colors: [
                    EchoTheme.Color.signInBlue.opacity(0.95),
                    EchoTheme.Color.signInBlue.opacity(0.62),
                  ],
                  startPoint: .topLeading,
                  endPoint: .bottomTrailing
                )
              )
            Image(systemName: systemName)
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.onAccent)
          } else {
            Image(systemName: systemName)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.72))
          }
        }
        .frame(width: 40, height: 40)
        .background(
          usesAccentAvatar ? Color.clear : EchoTheme.Color.ink(0.07),
          in: Circle()
        )
        .overlay(alignment: .topTrailing) {
          if badge > 0 {
            Text(badge > 99 ? "99+" : "\(badge)")
              .font(.system(size: 9, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.onAccent)
              .padding(.horizontal, badge > 9 ? 4 : 0)
              .frame(minWidth: 16, minHeight: 16)
              .background(EchoTheme.Color.badge, in: Capsule())
              .offset(x: 4, y: -4)
          }
        }

        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.88))
          if let subtitle {
            Text(subtitle)
              .font(.system(size: 12, weight: .regular, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.46))
              .lineLimit(1)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .echoPointerHoverFill(
        isSelected: isSelected,
        selectedFill: EchoTheme.Color.ink(0.10),
        hoverFill: EchoTheme.Color.ink(0.08),
        idleFill: EchoTheme.Color.ink(0.045),
        cornerRadius: 12
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(subtitle ?? "")
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}

struct EchoHomeActionButton: View {
  let systemName: String
  let accessibilityLabel: String
  var notificationCount = 0
  /// Active destination (Friends / Notifications open in the detail column).
  var isSelected = false
  let action: () -> Void
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme
  @State private var hovering = false

  private var isHighlighted: Bool { notificationCount > 0 }

  private var fillOpacity: Double {
    if isHighlighted { return 0 }
    if isSelected { return displayPrefs.inkOpacity(0.12) }
    return displayPrefs.inkOpacity(hovering ? 0.10 : 0.065)
  }

  var body: some View {
    Button(action: action) {
      ZStack(alignment: .topTrailing) {
        Image(systemName: systemName)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(
            isHighlighted
              ? EchoTheme.Color.onAccent
              : displayPrefs.ink(isSelected ? 0.92 : 0.82)
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        if isHighlighted {
          Text(notificationCount > 99 ? "99+" : String(notificationCount))
            .font(.system(size: notificationCount > 9 ? 8 : 10, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.onAccent)
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
          ? displayPrefs.actionHighlight(colorScheme: colorScheme).opacity(0.92)
          : EchoTheme.Color.ink(fillOpacity),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(
            isHighlighted
              ? EchoTheme.Color.ink(displayPrefs.hairlineOpacity(0.19))
              : EchoTheme.Color.ink(
                displayPrefs.hairlineOpacity(
                  isSelected ? 0.16 : (hovering ? 0.14 : 0.08))))
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel(
      isHighlighted
        ? EchoCopy.format("%@, %lld notifications", accessibilityLabel, notificationCount)
        : accessibilityLabel
    )
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
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
  var isSelected = false
  var unreadCount = 0
  let onTap: () -> Void
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var showsUnreadBadge: Bool {
    EchoDmUnreadBadge.shouldShow(count: unreadCount, isSelected: isSelected)
  }

  var body: some View {
    let metrics = displayPrefs.densityMetrics
    Button(action: onTap) {
      HStack(spacing: 13) {
        EchoConversationAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken
        )
        .frame(width: 52, height: 52)
        .overlay(alignment: .topTrailing) {
          if showsUnreadBadge {
            EchoDmUnreadBadgeView(
              count: unreadCount,
              borderColor: displayPrefs.canvas(colorScheme: colorScheme)
            )
            .offset(x: 4, y: -2)
          }
        }

        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 7) {
            Text(conversation.displayName)
              .font(displayPrefs.uiFont(size: 16, weight: .semibold))
              .foregroundStyle(displayPrefs.ink(0.94))
              .lineLimit(1)
            Spacer(minLength: 0)
            if let date = conversation.lastMessageAt {
              Text(relativeDateLabel(date))
                .font(displayPrefs.uiFont(size: 12, weight: .medium))
                .foregroundStyle(
                  showsUnreadBadge ? displayPrefs.ink(0.62) : displayPrefs.ink(0.34))
            }
          }

          Text(
            conversation.lastMessage
              ?? (conversation.lastMessageAt == nil ? EchoCopy.string("No messages yet") : " ")
          )
          .font(
            displayPrefs.uiFont(size: 14, weight: showsUnreadBadge ? .semibold : .regular)
          )
          .foregroundStyle(
            showsUnreadBadge ? displayPrefs.ink(0.72) : displayPrefs.ink(0.48))
          .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, metrics.dmRowPaddingX + 10)
      .padding(.vertical, metrics.dmRowPaddingY)
      .frame(maxWidth: .infinity, alignment: .leading)
      .echoPointerHoverFill(
        isSelected: isSelected,
        selectedFill: EchoTheme.Color.signInBlue.opacity(0.14),
        hoverFill: EchoTheme.Color.ink(0.07),
        cornerRadius: 12
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(conversation.displayName)
    .accessibilityValue(accessibilityValueText)
    .accessibilityHint(EchoCopy.string("Open conversation"))
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var accessibilityValueText: String {
    let preview = conversation.lastMessage ?? EchoCopy.string("No messages yet")
    guard showsUnreadBadge else { return preview }
    return EchoCopy.format("%@ · %lld unread", preview, unreadCount)
  }
}

struct EchoConversationAvatar: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  /// Hide for personal notes / guild chrome that already owns presence elsewhere.
  var showsPresence = true
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  /// Custom group icon when set; otherwise the member collage (same rule as web overview).
  private var showsCollage: Bool {
    let custom = conversation.avatarURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return custom.isEmpty && conversation.avatarURLs.count > 1
  }

  var body: some View {
    ZStack {
      Circle().fill(EchoTheme.Color.ink(0.08))
      if showsCollage {
        EchoGroupAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken)
      } else if conversation.avatarURL != nil {
        EchoMediaImage(
          source: conversation.avatarURL,
          baseURL: baseURL,
          accessToken: accessToken,
          maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
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
    }
    .overlay(alignment: .bottomTrailing) {
      if showsPresence && !showsCollage && !conversation.isGroup {
        EchoPresenceIndicator(
          status: conversation.presenceStatus,
          size: 14,
          borderColor: displayPrefs.canvas(colorScheme: colorScheme)
        )
        .offset(x: -1, y: -1)
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
          EchoMediaImage(
            source: source,
            baseURL: baseURL,
            accessToken: accessToken,
            maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
          ) {
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
      ProgressView().tint(EchoTheme.Color.ink(0.78)).scaleEffect(1.1)
      EchoCopy.text("Loading your Echo")
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.54))
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
        .foregroundStyle(EchoTheme.Color.ink(0.58))
      Text(message)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.58))
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
