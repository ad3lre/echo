import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoHomeBackground: View {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    ZStack {
      displayPrefs.canvas(colorScheme: colorScheme)
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
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  let onProfileTap: () -> Void
  let onMenuTap: () -> Void

  var body: some View {
    Button(action: onProfileTap) {
      VStack(spacing: 0) {
        ZStack(alignment: .bottom) {
          EchoProfileBanner(
            profile: profile, baseURL: baseURL, accessToken: accessToken,
            appliesEffects: true,
            showsRefractionBleed: false
          )
          // Extend the artwork beneath the curve so raster/remote-image
          // edges can never form a hairline seam at the section boundary.
          .frame(height: 226)
          .clipped()

          EchoHeaderSlice(raisedChromeShelves: colorScheme == .light)
            .fill(displayPrefs.canvas(colorScheme: colorScheme))
            .frame(height: 84)
            .allowsHitTesting(false)

          HStack(alignment: .bottom, spacing: 14) {
            EchoProfileAvatar(
              profile: profile, baseURL: baseURL, accessToken: accessToken
            )
            .frame(width: 76, height: 76)
            .zIndex(2)

            VStack(alignment: .leading, spacing: 3) {
              Text(profile.name)
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.fg)
                .lineLimit(1)
              Text(profile.username.map { "@\($0)" } ?? "")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.58))
                .lineLimit(1)
            }
            // Seat the name on the raised chrome shelf (edit-profile parity).
            .padding(.bottom, 10)

            Spacer(minLength: 0)

            Button(action: onMenuTap) {
              Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(EchoTheme.Color.ink(0.46))
                .frame(width: 42, height: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.bottom, 10)
          }
          .padding(.horizontal, 22)
          .padding(.bottom, 8)
          .zIndex(1)
        }
        .background(displayPrefs.canvas(colorScheme: colorScheme))

        // Opaque seal so no banner fringe can show between header and search.
        displayPrefs.canvas(colorScheme: colorScheme)
          .frame(height: 1)
          .allowsHitTesting(false)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("Open profile for %@", profile.name))
  }
}

/// Canvas fill that seals the home banner. In light mode the top edge lifts in
/// two soft shelves under the display name and the trailing caret so ink stays
/// readable without raising the entire wave.
struct EchoHeaderSlice: Shape {
  /// When true, peek the curve up under name + caret (light / sunny chrome).
  var raisedChromeShelves: Bool = false

  func path(in rect: CGRect) -> Path {
    if raisedChromeShelves {
      return lightReadablePath(in: rect)
    }
    return standardPath(in: rect)
  }

  private func standardPath(in rect: CGRect) -> Path {
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

  /// Soft rise under the display name (+ a lighter one under the caret) so
  /// light-mode ink sits on chrome, not the banner photograph.
  private func lightReadablePath(in rect: CGRect) -> Path {
    var path = Path()
    let w = rect.width
    // A modest lift vs the prior shelves — enough for the name to clear the
    // banner, without the tall twin peaks that read as excessive.
    let nameY = rect.midY - 12
    let dipY = rect.midY + 4
    let caretY = rect.midY - 8
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: w * 0.36, y: nameY),
      control1: CGPoint(x: w * 0.16, y: rect.midY + 6),
      control2: CGPoint(x: w * 0.26, y: nameY + 2)
    )
    path.addCurve(
      to: CGPoint(x: w * 0.70, y: dipY),
      control1: CGPoint(x: w * 0.48, y: nameY),
      control2: CGPoint(x: w * 0.58, y: dipY + 2)
    )
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: caretY),
      control1: CGPoint(x: w * 0.82, y: dipY),
      control2: CGPoint(x: w * 0.92, y: caretY)
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
  /// Canvas (or themed) ring around the avatar — drawn under the presence badge
  /// so the online indicator is never half-covered by the stroke.
  var rimWidth: CGFloat = 0
  var rimColor: Color? = nil
  var presenceSize: CGFloat = 20
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  private var resolvedRimColor: Color {
    rimColor ?? displayPrefs.canvas(colorScheme: colorScheme)
  }

  var body: some View {
    // Presence must overlay the circle bounds — not the shadow. Shadow after
    // the badge was expanding layout and parking the dot under the avatar.
    avatarImage
      .overlay {
        if rimWidth > 0 {
          Circle()
            .stroke(resolvedRimColor, lineWidth: rimWidth)
            .allowsHitTesting(false)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if presenceStatus != nil {
          EchoPresenceIndicator(
            status: presenceStatus,
            size: presenceSize,
            borderColor: resolvedRimColor
          )
          // Sit on the rim; keep above the stroke so half the badge isn’t clipped.
          .offset(x: rimWidth > 0 ? 1 : -2, y: rimWidth > 0 ? 1 : -2)
          .zIndex(2)
          .allowsHitTesting(false)
        }
      }
      .echoShadow(color: .black.opacity(0.32), radius: 14, y: 8)
  }

  @ViewBuilder
  private var avatarImage: some View {
    if let avatarURL = profile.avatarURL,
      !avatarURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      EchoMediaImage(
        source: profile.avatarURL,
        baseURL: baseURL,
        accessToken: accessToken,
        maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
      ) {
        EchoGeneratedAvatar(name: profile.name, seed: profile.name)
      }
      .clipShape(Circle())
    } else {
      EchoGeneratedAvatar(name: profile.name, seed: profile.name)
    }
  }
}

struct EchoDirectMessageList: View {
  let conversations: [EchoDirectMessage]
  @Binding var searchText: String
  @FocusState.Binding var searchFocused: Bool
  let baseURL: URL
  var accessToken: String? = nil
  let onRefresh: () async -> Void
  /// When search was focused, first tap should only dismiss the keyboard.
  var onConsumeKeyboardTap: () -> Bool = { false }
  let onOpen: (EchoDirectMessage) -> Void
  let inboxNotificationCount: Int
  let onOpenInbox: () -> Void
  @State private var hasScrolled = false
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          TextField(EchoCopy.string("Search conversations"), text: $searchText)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .tint(EchoTheme.Color.fg)
            .textFieldStyle(.plain)
            .focused($searchFocused)
            .submitLabel(.search)
            #if os(iOS)
              .textInputAutocapitalization(.never)
            #endif
            .autocorrectionDisabled()
            // While focused, a tap on the field dismisses — it must not keep
            // rebinding the caret / keyboard (conversation-search parity).
            .overlay {
              if searchFocused {
                Color.clear
                  .contentShape(Rectangle())
                  .onTapGesture { dismissSearchKeyboard() }
              }
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
          EchoTheme.Color.ink(0.065), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(
            searchFocused ? EchoTheme.Color.indigo.opacity(0.55) : EchoTheme.Color.ink(0.08))
        )

        EchoHomeActionButton(
          systemName: "tray.fill",
          accessibilityLabel: EchoCopy.string("Inbox"),
          notificationCount: inboxNotificationCount,
          action: {
            if onConsumeKeyboardTap() { return }
            onOpenInbox()
          }
        )
      }
      .padding(.horizontal, 22)
      .padding(.top, 10)
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
              .foregroundStyle(EchoTheme.Color.ink(0.46))
              .padding(.horizontal, 24)
              .padding(.top, 18)
              .frame(maxWidth: .infinity)
              .contentShape(Rectangle())
              .onTapGesture { dismissSearchKeyboard() }
            } else {
              ForEach(conversations) { conversation in
                EchoDirectMessageRow(
                  conversation: conversation,
                  baseURL: baseURL,
                  accessToken: accessToken,
                  onTap: {
                    if onConsumeKeyboardTap() { return }
                    onOpen(conversation)
                  }
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
        .scrollDismissesKeyboard(.immediately)
        .refreshable {
          await onRefresh()
        }

        LinearGradient(
          colors: [
            displayPrefs.canvas(colorScheme: colorScheme),
            displayPrefs.canvas(colorScheme: colorScheme).opacity(0),
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
    .onDisappear { dismissSearchKeyboard() }
  }

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }
}

struct EchoHomeActionButton: View {
  let systemName: String
  let accessibilityLabel: String
  var notificationCount = 0
  let action: () -> Void
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var isHighlighted: Bool { notificationCount > 0 }

  var body: some View {
    Button(action: action) {
      ZStack(alignment: .topTrailing) {
        Image(systemName: systemName)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(isHighlighted ? EchoTheme.Color.onAccent : displayPrefs.ink(0.82))
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
          : EchoTheme.Color.ink(displayPrefs.inkOpacity(0.065)),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(
            isHighlighted
              ? EchoTheme.Color.ink(displayPrefs.hairlineOpacity(0.19))
              : EchoTheme.Color.ink(displayPrefs.hairlineOpacity(0.08)))
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
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    let metrics = displayPrefs.densityMetrics
    Button(action: onTap) {
      HStack(spacing: 13) {
        EchoConversationAvatar(
          conversation: conversation, baseURL: baseURL, accessToken: accessToken
        )
        .frame(width: 52, height: 52)

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
                .foregroundStyle(displayPrefs.ink(0.34))
            }
          }

          Text(
            conversation.lastMessage
              ?? (conversation.lastMessageAt == nil ? EchoCopy.string("No messages yet") : " ")
          )
          .font(displayPrefs.uiFont(size: 14))
          .foregroundStyle(displayPrefs.ink(0.48))
          .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, metrics.dmRowPaddingX + 10)
      .padding(.vertical, metrics.dmRowPaddingY)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
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
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    ZStack {
      Circle().fill(EchoTheme.Color.ink(0.08))
      if conversation.avatarURLs.count > 1 {
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
      if conversation.avatarURLs.count <= 1 {
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
