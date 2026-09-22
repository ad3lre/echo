import EchoDomain
import EchoNetworking
import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif

/// Full-screen, conversation-scoped message search for iOS and macOS.
struct EchoConversationSearchView: View {
  let conversation: EchoDirectMessage
  let baseURL: URL
  let userID: String
  let onSelectMessage: (EchoMessage) -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoMessageSearchModel?
  @State private var query = ""
  @State private var filterEpoch = 0
  @FocusState private var searchFocused: Bool

  private var searchKey: String { "\(query)|\(filterEpoch)" }

  var body: some View {
    VStack(spacing: 0) {
      searchChrome
      Group {
        if let model {
          EchoConversationSearchFilters(model: model) {
            filterEpoch &+= 1
          }
          .padding(.top, 10)
          .padding(.bottom, 8)
        }
        searchContent
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .contentShape(Rectangle())
      .simultaneousGesture(
        TapGesture().onEnded { dismissSearchKeyboard() }
      )
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task {
      let searchModel =
        model
        ?? EchoMessageSearchModel(
          conversation: conversation,
          baseURL: baseURL,
          auth: auth,
          userID: userID
        )
      model = searchModel
      searchModel.auth = auth
      searchFocused = true
    }
    .task(id: searchKey) {
      do {
        try await Task.sleep(for: .milliseconds(query.isEmpty ? 40 : 240))
      } catch {
        return
      }
      guard !Task.isCancelled, let model else { return }
      await model.search(query)
    }
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
  }

  /// Minimal chrome: search field + trailing caret to dismiss. No title stack.
  private var searchChrome: some View {
    HStack(spacing: 10) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.44))
        TextField(EchoCopy.string("Search"), text: $query)
          .font(.system(size: 16, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
          .focused($searchFocused)
          .submitLabel(.search)
          #if os(iOS)
            .textInputAutocapitalization(.never)
          #endif
          .autocorrectionDisabled()
          .accessibilityLabel(EchoCopy.string("Search messages"))
          // While focused, the first tap on the field only dismisses the keyboard —
          // it must not reposition the caret. After blur, taps focus/move normally.
          .overlay {
            if searchFocused {
              Color.clear
                .contentShape(Rectangle())
                .onTapGesture { dismissSearchKeyboard() }
            }
          }
        if !query.isEmpty {
          Button {
            query = ""
            searchFocused = true
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.system(size: 15))
              .foregroundStyle(EchoTheme.Color.ink(0.36))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Clear search"))
        }
      }
      .padding(.horizontal, 13)
      .frame(height: 44)
      .background(
        EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 14, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(
            searchFocused ? EchoTheme.Color.indigo.opacity(0.85) : EchoTheme.Color.ink(0.09),
            lineWidth: 1)
      }

      Button {
        dismiss()
      } label: {
        Image(systemName: "chevron.right")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.78))
          .frame(width: 40, height: 44)
          .background(
            EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 14, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(EchoTheme.Color.ink(0.09), lineWidth: 1)
          }
          .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .animation(.easeOut(duration: 0.18), value: searchFocused)
  }

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    #if canImport(UIKit)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  @ViewBuilder
  private var searchContent: some View {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasCriteria = model?.hasActiveCriteria == true
    if trimmed.isEmpty && !hasCriteria {
      EchoSearchEmptyState(
        systemImage: "line.3.horizontal.decrease.circle",
        title: EchoCopy.string("Find in conversation"),
        message: EchoCopy.string("Type to search, or tap a filter.")
      )
    } else if let model, model.isSearching && model.results.isEmpty {
      EchoSearchLoadingState()
    } else if let model, let errorMessage = model.errorMessage, model.results.isEmpty {
      EchoSearchFailureState(message: errorMessage) {
        await model.search(query)
      }
    } else if let model, model.results.isEmpty {
      EchoSearchEmptyState(
        systemImage: "magnifyingglass",
        title: EchoCopy.string("No messages found"),
        message: EchoCopy.string("Try a different search")
      )
    } else if let model {
      ScrollView(showsIndicators: false) {
        LazyVStack(spacing: 10) {
          if !model.results.isEmpty {
            Text(EchoCopy.format("%lld results", model.results.count))
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.38))
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.bottom, 2)
          }
          ForEach(model.results) { message in
            EchoConversationSearchResult(
              message: message,
              conversation: conversation,
              baseURL: baseURL
            ) {
              onSelectMessage(message)
              dismiss()
            }
            .onAppear {
              guard message.id == model.results.last?.id else { return }
              Task { await model.loadMore() }
            }
          }
          if model.isLoadingMore {
            ProgressView()
              .tint(EchoTheme.Color.ink(0.62))
              .padding(.vertical, 14)
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 22)
      }
      .scrollDismissesKeyboard(.immediately)
    }
  }
}

private struct EchoSearchEmptyState: View {
  let systemImage: String
  let title: String
  let message: String

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: systemImage)
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(EchoTheme.Color.indigoSoft)
        .frame(width: 58, height: 58)
        .background(EchoTheme.Color.indigo.opacity(0.14), in: Circle())
      Text(title)
        .font(.system(size: 17, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.92))
      Text(message)
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 260)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.bottom, 80)
  }
}

private struct EchoSearchLoadingState: View {
  var body: some View {
    VStack(spacing: 14) {
      ProgressView().tint(EchoTheme.Color.ink(0.75)).scaleEffect(1.1)
      Text(EchoCopy.string("Loading messages"))
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct EchoSearchFailureState: View {
  let message: String
  let retry: () async -> Void

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 24, weight: .medium))
        .foregroundStyle(.orange.opacity(0.86))
      Text(message)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.58))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 280)
      Button(EchoCopy.string("Try again")) {
        Task { await retry() }
      }
      .buttonStyle(.borderedProminent)
      .tint(EchoTheme.Color.indigo)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct EchoConversationSearchResult: View {
  let message: EchoMessage
  let conversation: EchoDirectMessage
  let baseURL: URL
  let onSelect: () -> Void
  @Environment(EchoAuthenticationModel.self) private var auth

  private var imageAttachments: [EchoMessageAttachment] {
    let fromEmbeds = EchoGifHostLinks.inlineGifAttachments(from: message.embeds)
    return message.attachments.filter(\.isImage) + fromEmbeds
  }

  private var videoAttachments: [EchoMessageAttachment] {
    message.attachments.filter(\.isVideo)
  }

  private var otherAttachments: [EchoMessageAttachment] {
    message.attachments.filter { !$0.isImage && !$0.isVideo }
  }

  private var displayContent: String {
    EchoGifHostLinks.contentWithoutInlineGifHostURLs(message.content, embeds: message.embeds)
  }

  private var accessToken: String? { auth.activeSession?.accessToken }

  private var hasVisualMedia: Bool {
    !imageAttachments.isEmpty || !videoAttachments.isEmpty
  }

  var body: some View {
    Button(action: onSelect) {
      HStack(alignment: .top, spacing: 11) {
        EchoMediaImage(
          source: message.authorAvatarURL ?? conversation.avatarURL,
          baseURL: baseURL,
          accessToken: accessToken
        ) {
          EchoGeneratedAvatar(
            name: message.authorDisplayName ?? conversation.displayName,
            seed: message.authorID
          )
        }
        .clipShape(Circle())
        .frame(width: 34, height: 34)

        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(message.authorDisplayName ?? conversation.displayName)
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.94))
              .lineLimit(1)
            if let timestamp = message.timestamp {
              Text(EchoMessageTimestampFormatter.string(from: timestamp))
                .font(.system(size: 11, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.36))
                .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.28))
          }

          if !displayContent.isEmpty {
            EchoMarkdownView(
              markdown: displayContent,
              mentions: message.mentions,
              apiBaseURL: baseURL,
              accessToken: accessToken
            )
            .lineLimit(3)
          } else if let pollQuestion = message.poll?.question,
            !pollQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          {
            Label(pollQuestion, systemImage: "chart.bar.fill")
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.62))
              .lineLimit(2)
          } else if !hasVisualMedia && otherAttachments.isEmpty {
            Text(EchoCopy.string("Empty message"))
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.42))
          }

          if !imageAttachments.isEmpty {
            EchoMessageMediaCollage(
              images: imageAttachments,
              baseURL: baseURL,
              accessToken: accessToken,
              maxWidth: .infinity
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .allowsHitTesting(false)
          }

          ForEach(Array(videoAttachments.prefix(2).enumerated()), id: \.offset) { _, attachment in
            EchoVideoAttachmentPreview(
              attachment: attachment,
              baseURL: baseURL,
              accessToken: auth.activeSession?.accessToken
            ) {}
            .allowsHitTesting(false)
          }

          if !otherAttachments.isEmpty {
            mediaBadges(for: otherAttachments)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        EchoTheme.Color.elevatedMid.opacity(0.92),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.07), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      EchoCopy.format("Open message from %@", message.authorDisplayName ?? conversation.displayName)
    )
  }

  @ViewBuilder
  private func mediaBadges(for attachments: [EchoMessageAttachment]) -> some View {
    let audio = attachments.filter(\.isAudio).count
    let docs = attachments.filter(\.isDocument).count
    HStack(spacing: 6) {
      if audio > 0 {
        mediaBadge(EchoCopy.string("Audio"), systemImage: "waveform")
      }
      if docs > 0 {
        mediaBadge(
          docs == 1
            ? (attachments.first(where: \.isDocument)?.filename ?? EchoCopy.string("File"))
            : EchoCopy.format("%lld files", docs),
          systemImage: "doc.fill")
      }
    }
  }

  private func mediaBadge(_ title: String, systemImage: String) -> some View {
    Label(title, systemImage: systemImage)
      .font(.system(size: 11, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.58))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(EchoTheme.Color.ink(0.06), in: Capsule())
      .lineLimit(1)
  }
}
