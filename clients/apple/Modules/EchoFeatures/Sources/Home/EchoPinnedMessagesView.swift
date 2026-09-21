import EchoDomain
import SwiftUI

/// Sheet listing pinned messages for the open conversation (web pins dropdown parity).
struct EchoPinnedMessagesView: View {
  @Bindable var model: EchoMessageTimelineModel
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String? = nil
  let onSelectMessage: (String) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      header
      if model.pinnedMessageIDs.isEmpty {
        emptyState
      } else {
        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 0) {
            ForEach(model.pinnedMessagesForSheet) { message in
              Button {
                onSelectMessage(message.id)
                dismiss()
              } label: {
                pinRow(message)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.bottom, 24)
        }
      }
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task { await model.refreshPins() }
    .alert(
      EchoCopy.string("Pins"),
      isPresented: Binding(
        get: { model.pinErrorMessage != nil },
        set: { if !$0 { model.clearPinError() } }
      )
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) { model.clearPinError() }
    } message: {
      Text(model.pinErrorMessage ?? "")
    }
  }

  private var header: some View {
    HStack(spacing: 12) {
      Text(EchoCopy.string("Pinned messages"))
        .font(.system(size: 18, weight: .bold, design: .rounded))
        .foregroundStyle(.white.opacity(0.96))
      Spacer(minLength: 0)
      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white.opacity(0.72))
          .frame(width: 34, height: 34)
          .background(.white.opacity(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
    .padding(.horizontal, 18)
    .padding(.top, 16)
    .padding(.bottom, 12)
  }

  private var emptyState: some View {
    VStack(spacing: 12) {
      Image(systemName: "pin.slash")
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(EchoTheme.Color.indigoSoft)
        .frame(width: 58, height: 58)
        .background(EchoTheme.Color.indigo.opacity(0.14), in: Circle())
      Text(EchoCopy.string("No pinned messages"))
        .font(.system(size: 16, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.9))
      Text(EchoCopy.string("Long-press a message to pin it."))
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.46))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 260)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.bottom, 60)
  }

  private func pinRow(_ message: EchoMessage) -> some View {
    HStack(alignment: .top, spacing: 11) {
      EchoMediaImage(
        source: message.authorAvatarURL ?? conversation.avatarURL,
        baseURL: baseURL,
        accessToken: accessToken
      ) {
        EchoGeneratedAvatar(
          name: message.authorDisplayName ?? conversation.displayName,
          seed: message.authorID.isEmpty ? conversation.channelID : message.authorID
        )
      }
      .clipShape(Circle())
      .frame(width: 36, height: 36)

      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Text(pinAuthorName(message))
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.88))
            .lineLimit(1)
          Spacer(minLength: 0)
          Image(systemName: "pin.fill")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.indigoSoft.opacity(0.9))
        }
        Text(pinPreview(message))
          .font(.system(size: 14, weight: .regular, design: .rounded))
          .foregroundStyle(.white.opacity(0.72))
          .lineLimit(3)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
    .contentShape(Rectangle())
    .accessibilityLabel(
      EchoCopy.format(
        "Open pinned message from %@",
        pinAuthorName(message))
    )
  }

  private func pinAuthorName(_ message: EchoMessage) -> String {
    if let name = message.authorDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    {
      return name
    }
    if message.authorID.isEmpty { return conversation.displayName }
    return EchoMessageTimelineModel.authorDisplayName(
      message: message, conversation: conversation)
  }

  private func pinPreview(_ message: EchoMessage) -> String {
    let preview = message.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
    if !preview.isEmpty { return preview }
    return EchoCopy.string("Pinned message")
  }
}
