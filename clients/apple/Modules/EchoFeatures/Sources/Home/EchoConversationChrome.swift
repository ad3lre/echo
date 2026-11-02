import EchoDomain
import SwiftUI

struct EchoConversationHeader: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let isPersonalNotes: Bool
  var isGuildChannel = false
  var guildChannel: EchoGuildChannel? = nil
  var pinnedCount: Int = 0
  var showsPins = true
  var showsCall = true
  let onProfileTap: () -> Void
  let onExit: () -> Void
  let onCall: () -> Void
  let onPins: () -> Void
  let onSearch: () -> Void
  var onMembers: (() -> Void)? = nil
  /// 1:1 DM header — opens group-create with this peer preselected (web community icon).
  var onCreateGroup: (() -> Void)? = nil
  /// Portrait / phone push — hide on desktop & wide split (web has no back).
  var showsExitButton = true
  var compactSideChat = false
  var onCloseSideChat: (() -> Void)? = nil
  /// False when a call notch shares the conversation wash with this header.
  var drawsBackground = true
  /// Live role preview chip (web chat header) — guild only.
  var rolePreview: EchoRolePreviewState? = nil
  var onExitRolePreview: (() -> Void)? = nil

  var body: some View {
    if compactSideChat {
      compactVoiceSideChatHeader
    } else {
      standardHeader
    }
  }

  private var compactVoiceSideChatHeader: some View {
    HStack(spacing: 8) {
      #if os(iOS)
        Button(action: onExit) {
          Image(systemName: "arrow.left")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.88))
            .frame(width: 36, height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Show channels"))
      #endif
      if let guildChannel {
        EchoChannelIcon(
          channel: guildChannel, baseURL: baseURL, accessToken: accessToken, size: 16)
      }
      Text(conversation.displayName)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.88))
        .lineLimit(1)
      Spacer(minLength: 0)
      #if os(macOS)
        conversationAction(
          "magnifyingglass", label: EchoCopy.string("Search messages"), action: onSearch)
        if let onCloseSideChat {
          conversationAction(
            "xmark", label: EchoCopy.string("Hide chat"), action: onCloseSideChat)
        }
      #else
        if let onCloseSideChat {
          Button(action: onCloseSideChat) {
            Text(EchoCopy.string("Voice"))
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.88))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(
                EchoTheme.Color.ink(0.08),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
              )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Back to voice"))
        }
      #endif
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 8)
    .frame(height: 44)
    .frame(maxWidth: .infinity)
    #if os(iOS)
      .safeAreaPadding(.top)
    #endif
    .background(EchoTheme.Color.ink(0.03))
  }

  private var standardHeader: some View {
    HStack(spacing: 8) {
      if showsExitButton {
        Button(action: onExit) {
          Image(systemName: "arrow.left")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.88))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          isGuildChannel
            ? EchoCopy.string("Show channels")
            : EchoCopy.string("Close conversation")
        )
      }

      Button(action: onProfileTap) {
        HStack(spacing: 9) {
          if isGuildChannel, let guildChannel {
            EchoChannelIcon(
              channel: guildChannel, baseURL: baseURL, accessToken: accessToken, size: 22
            )
            .frame(width: 34, height: 34)
            .background(EchoTheme.Color.ink(0.06), in: Circle())
          } else {
            EchoConversationAvatar(
              conversation: conversation,
              baseURL: baseURL,
              accessToken: accessToken,
              showsPresence: !isPersonalNotes
            )
            .frame(width: 34, height: 34)
          }

          VStack(alignment: .leading, spacing: 1) {
            Text(conversation.displayName)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.94))
              .lineLimit(1)
            if isGuildChannel {
              Text(EchoCopy.string("Members"))
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
                .lineLimit(1)
            } else if conversation.isGroup {
              Text(EchoGroupDmRules.memberCountLabel(for: conversation.memberUserIDs.count))
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
                .lineLimit(1)
            } else if let username = conversation.username, !username.isEmpty {
              Text("@\(username)")
                .font(.system(size: 11, weight: .regular, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
                .lineLimit(1)
            }
          }

          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.34))
            .padding(.leading, 1)
        }
        // Fill the middle so roughly tapping near the name / avatar still opens.
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .echoPointerHoverFill(
          hoverFill: EchoTheme.Color.ink(0.06),
          cornerRadius: 10)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        isGuildChannel
          ? EchoCopy.string("Open members")
          : EchoCopy.format("Open %@ profile", conversation.displayName)
      )

      if isGuildChannel, let rolePreview, let onExitRolePreview {
        EchoRolePreviewHeaderChip(
          roleName: rolePreview.roleName,
          roleColor: rolePreview.roleColor,
          onExit: onExitRolePreview)
      }

      HStack(spacing: 4) {
        if showsCall && !isPersonalNotes && !isGuildChannel {
          conversationAction("phone.fill", label: EchoCopy.string("Call"), action: onCall)
        }
        if let onCreateGroup, !isPersonalNotes, !isGuildChannel, !conversation.isGroup {
          conversationAction(
            "person.2.fill", label: EchoCopy.string("New group DM"), action: onCreateGroup)
        }
        if isGuildChannel, let onMembers {
          conversationAction(
            "person.3.fill", label: EchoCopy.string("Members"), action: onMembers)
        }
        if showsPins && !isGuildChannel {
          conversationAction(
            "pin.fill",
            label: EchoCopy.string("Pinned messages"),
            emphasized: pinnedCount > 0,
            action: onPins)
        }
        conversationAction(
          "magnifyingglass", label: EchoCopy.string("Search messages"), action: onSearch)
      }
    }
    .padding(.horizontal, 14)
    // Sit a bit closer to the notch/status band (~10% tighter than before).
    .padding(.top, 8)
    .padding(.bottom, 12)
    .frame(maxWidth: .infinity)
    .background {
      if drawsBackground, !(isPersonalNotes && !isGuildChannel) {
        EchoAlignedConversationWash()
          .ignoresSafeArea(edges: .top)
      }
    }
  }

  private func conversationAction(
    _ systemName: String,
    label: String,
    emphasized: Bool = false,
    action: @escaping () -> Void = {}
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemName)
        // Force a shared optical box — SF Symbol outlines (search) otherwise
        // read much larger than filled pin/people at the same point size.
        .symbolRenderingMode(.monochrome)
        .resizable()
        .scaledToFit()
        .frame(width: 17, height: 17)
        .fontWeight(.semibold)
        .foregroundStyle(
          emphasized ? EchoTheme.Color.indigoSoft : EchoTheme.Color.ink(0.68)
        )
        // ~44pt comfort zone — near-miss taps still count as intentional.
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .echoPointerHoverFill(
          hoverFill: EchoTheme.Color.ink(0.06),
          idleFill: Color.clear,
          cornerRadius: 10
        )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
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
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .lineLimit(2)
      Spacer(minLength: 4)
      Button(EchoCopy.string("Retry")) {
        Task { await retry() }
      }
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.88))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
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
        .foregroundStyle(EchoTheme.Color.ink(0.55))
      Text(message)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.58))
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
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    let wash = EchoTheme.forcedVariant == .amoled ? 0.0 : 0.28
    return ZStack {
      EchoTheme.Color.canvas
      if wash > 0 {
        RadialGradient(
          colors: [EchoTheme.Color.ambientIndigo.opacity(wash), .clear],
          center: UnitPoint(x: 0.92, y: 0.02),
          startRadius: 0,
          endRadius: 360
        )
        RadialGradient(
          colors: [EchoTheme.Color.launchGlowPurple.opacity(0.35), .clear],
          center: UnitPoint(x: 0.08, y: 0.85),
          startRadius: 0,
          endRadius: 300
        )
      }
    }
  }
}

/// Conversation wash aligned to the global screen so notch / header bleeds
/// don’t restart the ambient glow as a flatter band.
struct EchoAlignedConversationWash: View {
  var body: some View {
    GeometryReader { geo in
      let frame = geo.frame(in: .global)
      EchoConversationBackground()
        .frame(width: frame.width, height: max(frame.maxY + 520, 1100))
        .offset(y: -frame.minY)
    }
    .allowsHitTesting(false)
  }
}
