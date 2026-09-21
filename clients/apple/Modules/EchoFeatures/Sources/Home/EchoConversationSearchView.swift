import EchoDomain
import EchoNetworking
import SwiftUI

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
      if let model {
        EchoConversationSearchFilters(model: model) {
          filterEpoch &+= 1
        }
        .padding(.top, 10)
        .padding(.bottom, 8)
      }
      searchContent
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
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
          .foregroundStyle(.white.opacity(0.44))
        TextField(EchoCopy.string("Search"), text: $query)
          .font(.system(size: 16, weight: .regular, design: .rounded))
          .foregroundStyle(.white)
          .focused($searchFocused)
          .submitLabel(.search)
          #if os(iOS)
            .textInputAutocapitalization(.never)
          #endif
          .autocorrectionDisabled()
          .accessibilityLabel(EchoCopy.string("Search messages"))
        if !query.isEmpty {
          Button {
            query = ""
            searchFocused = true
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.system(size: 15))
              .foregroundStyle(.white.opacity(0.36))
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
            searchFocused ? EchoTheme.Color.indigo.opacity(0.85) : .white.opacity(0.09),
            lineWidth: 1)
      }

      Button {
        dismiss()
      } label: {
        Image(systemName: "chevron.right")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.white.opacity(0.78))
          .frame(width: 40, height: 44)
          .background(
            EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 14, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(.white.opacity(0.09), lineWidth: 1)
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
              .foregroundStyle(.white.opacity(0.38))
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
              .tint(.white.opacity(0.62))
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
        .foregroundStyle(.white.opacity(0.92))
      Text(message)
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.46))
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
      ProgressView().tint(.white.opacity(0.75)).scaleEffect(1.1)
      Text(EchoCopy.string("Loading messages"))
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.52))
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
        .foregroundStyle(.white.opacity(0.58))
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

  private var previewAttachment: EchoMessageAttachment? {
    message.attachments.first(where: \.isImage)
      ?? message.attachments.first(where: \.isVideo)
      ?? message.attachments.first
  }

  private var accessToken: String? { auth.activeSession?.accessToken }

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

        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(message.authorDisplayName ?? conversation.displayName)
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.94))
              .lineLimit(1)
            if let timestamp = message.timestamp {
              Text(EchoMessageTimestampFormatter.string(from: timestamp))
                .font(.system(size: 11, design: .rounded))
                .foregroundStyle(.white.opacity(0.36))
                .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(.white.opacity(0.28))
          }

          HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
              if !message.content.isEmpty {
                EchoMarkdownView(
                  markdown: message.content,
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
                  .foregroundStyle(.white.opacity(0.62))
                  .lineLimit(2)
              } else if previewAttachment == nil {
                Text(EchoCopy.string("Empty message"))
                  .font(.system(size: 13, weight: .medium, design: .rounded))
                  .foregroundStyle(.white.opacity(0.42))
              }

              if !message.attachments.isEmpty {
                mediaBadges
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let attachment = previewAttachment {
              searchMediaThumb(attachment)
            }
          }
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        EchoTheme.Color.elevatedMid.opacity(0.92),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(.white.opacity(0.07), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      EchoCopy.format("Open message from %@", message.authorDisplayName ?? conversation.displayName)
    )
  }

  @ViewBuilder
  private var mediaBadges: some View {
    let images = message.attachments.filter(\.isImage).count
    let videos = message.attachments.filter(\.isVideo).count
    let audio = message.attachments.filter(\.isAudio).count
    let docs = message.attachments.filter(\.isDocument).count
    HStack(spacing: 6) {
      if images > 0 {
        mediaBadge(
          images == 1 ? EchoCopy.string("Image") : EchoCopy.format("%lld images", images),
          systemImage: "photo")
      }
      if videos > 0 {
        mediaBadge(
          videos == 1 ? EchoCopy.string("Video") : EchoCopy.format("%lld videos", videos),
          systemImage: "film")
      }
      if audio > 0 {
        mediaBadge(EchoCopy.string("Audio"), systemImage: "waveform")
      }
      if docs > 0 {
        mediaBadge(
          docs == 1
            ? (message.attachments.first(where: \.isDocument)?.filename
              ?? EchoCopy.string("File"))
            : EchoCopy.format("%lld files", docs),
          systemImage: "doc.fill")
      }
    }
  }

  private func mediaBadge(_ title: String, systemImage: String) -> some View {
    Label(title, systemImage: systemImage)
      .font(.system(size: 11, weight: .semibold, design: .rounded))
      .foregroundStyle(.white.opacity(0.58))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(.white.opacity(0.06), in: Capsule())
      .lineLimit(1)
  }

  @ViewBuilder
  private func searchMediaThumb(_ attachment: EchoMessageAttachment) -> some View {
    ZStack {
      if attachment.isImage {
        EchoMediaImage(
          source: attachment.url,
          baseURL: baseURL,
          accessToken: accessToken,
          storageKey: attachment.storageKey,
          contentMode: .fill
        ) {
          Color.white.opacity(0.06)
            .overlay(ProgressView().controlSize(.mini).tint(.white.opacity(0.45)))
        }
      } else if attachment.isVideo {
        Color.black.opacity(0.35)
          .overlay {
            Image(systemName: "play.fill")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white.opacity(0.9))
          }
      } else if attachment.isAudio {
        Color.white.opacity(0.06)
          .overlay {
            Image(systemName: "waveform")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white.opacity(0.7))
          }
      } else {
        Color.white.opacity(0.06)
          .overlay {
            Image(systemName: "doc.fill")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white.opacity(0.7))
          }
      }
    }
    .frame(width: 52, height: 52)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(.white.opacity(0.1), lineWidth: 1)
    }
    .accessibilityHidden(true)
  }
}
