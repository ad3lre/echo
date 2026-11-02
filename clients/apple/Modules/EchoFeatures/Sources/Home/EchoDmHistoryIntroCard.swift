import EchoDomain
import SwiftUI

/// Web `DmHistoryIntroCard` — empty DM / group thread chrome.
struct EchoDmHistoryIntroCard: View {
  let content: EchoDmHistoryIntro.Content
  let baseURL: URL
  var accessToken: String = ""
  var onPrimaryAction: (() -> Void)? = nil
  var isActionBusy = false

  var body: some View {
    VStack(spacing: 0) {
      ZStack(alignment: .bottomTrailing) {
        avatar
          .frame(width: 80, height: 80)
        if !content.hidePresence {
          EchoPresenceIndicator(
            status: content.presenceStatus,
            size: 18,
            borderColor: EchoTheme.Color.canvas
          )
          .offset(x: 2, y: 2)
        }
      }
      .padding(.bottom, 14)

      Text(content.title)
        .font(.system(size: 20, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.94))
        .lineLimit(1)
        .padding(.horizontal, 12)

      Text(content.subtitle)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
        .multilineTextAlignment(.center)
        .padding(.top, 8)
        .padding(.horizontal, 16)

      if let action = content.primaryAction, let onPrimaryAction {
        Button(action: onPrimaryAction) {
          HStack(spacing: 8) {
            if isActionBusy {
              ProgressView()
                .controlSize(.small)
                .tint(.white)
            }
            Text(EchoDmHistoryIntro.actionLabel(action))
              .font(.system(size: 14, weight: .semibold, design: .rounded))
          }
          .foregroundStyle(Color.white)
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .background(EchoTheme.Color.presenceOnline, in: RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
        .disabled(isActionBusy)
        .padding(.top, 16)
        .accessibilityLabel(EchoDmHistoryIntro.actionLabel(action))
      }
    }
    .frame(maxWidth: 416)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 20)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(EchoCopy.string("Direct message history intro"))
  }

  @ViewBuilder
  private var avatar: some View {
    if content.isGroup {
      EchoConversationAvatar(
        conversation: EchoDirectMessage(
          id: content.channelID,
          channelID: content.channelID,
          memberUserIDs: content.avatarURLs.isEmpty ? ["group"] : content.avatarURLs,
          displayName: content.title,
          avatarURL: content.avatarURL,
          avatarURLs: content.avatarURLs
        ),
        baseURL: baseURL,
        accessToken: accessToken.isEmpty ? nil : accessToken,
        showsPresence: false
      )
    } else {
      EchoMediaImage(source: content.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: content.title, seed: content.title)
      }
      .clipShape(Circle())
    }
  }
}
