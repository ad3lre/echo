import EchoDomain
import EchoNetworking
import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif

/// Guild-wide message search sheet — web members column SearchBar / `fetchEchoServerMessageSearch`.
struct EchoServerMessageSearchView: View {
  let server: EchoServerSummary
  let channels: [EchoGuildChannel]
  let members: [EchoServerMember]
  let baseURL: URL
  let userID: String
  var onClose: (() -> Void)? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var model: EchoServerMessageSearchModel?
  @State private var query = ""
  @State private var filterEpoch = 0
  @FocusState private var searchFocused: Bool

  private var searchKey: String { "\(query)|\(filterEpoch)" }

  var body: some View {
    VStack(spacing: 0) {
      searchChrome
      if let model {
        EchoServerMessageSearchFilters(model: model) {
          filterEpoch &+= 1
        }
        .padding(.top, 6)
        .padding(.bottom, 4)
      }
      Group { searchContent }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .simultaneousGesture(TapGesture().onEnded { dismissSearchKeyboard() })
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task {
      let searchModel =
        model
        ?? EchoServerMessageSearchModel(
          server: server,
          baseURL: baseURL,
          auth: auth,
          userID: userID,
          channels: channels,
          members: members
        )
      model = searchModel
      searchModel.auth = auth
      searchModel.updateDirectory(channels: channels, members: members)
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

  private var searchChrome: some View {
    HStack(spacing: 10) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.44))
        TextField(
          EchoCopy.format("Search %@", server.name),
          text: $query
        )
        .font(.system(size: 16, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
        .focused($searchFocused)
        .submitLabel(.search)
        #if os(iOS)
          .textInputAutocapitalization(.never)
        #endif
        .autocorrectionDisabled()
        .accessibilityLabel(EchoCopy.format("Search %@", server.name))
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
      .padding(.horizontal, 4)
      .frame(height: 36)

      Button { closeSearch() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .frame(width: 28, height: 28)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
    .padding(.horizontal, 16)
    .padding(.top, 10)
    .padding(.bottom, 2)
  }

  @ViewBuilder
  private var searchContent: some View {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasCriteria = model?.hasActiveCriteria == true
    if trimmed.isEmpty && !hasCriteria {
      serverSearchEmpty(
        systemImage: "building.2",
        title: EchoCopy.string("Search this server"),
        message: EchoCopy.string("Try from:, in:, has:, or mentions:")
      )
    } else if let model, model.isSearching && model.results.isEmpty {
      VStack(spacing: 14) {
        ProgressView().tint(EchoTheme.Color.ink(0.75)).scaleEffect(1.1)
        Text(EchoCopy.string("Loading messages"))
          .font(.system(size: 14, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if let model, let errorMessage = model.errorMessage, model.results.isEmpty {
      VStack(spacing: 12) {
        Image(systemName: "wifi.exclamationmark")
          .font(.system(size: 24, weight: .medium))
          .foregroundStyle(.orange.opacity(0.86))
        Text(errorMessage)
          .font(.system(size: 14, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.58))
          .multilineTextAlignment(.center)
          .frame(maxWidth: 280)
        Button(EchoCopy.string("Try again")) {
          Task { await model.search(query) }
        }
        .buttonStyle(.plain)
        .foregroundStyle(EchoTheme.Color.ink(0.88))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if let model, model.results.isEmpty {
      serverSearchEmpty(
        systemImage: "magnifyingglass",
        title: EchoCopy.string("No messages found"),
        message: EchoCopy.string("Try a different search")
      )
    } else if let model {
      ScrollView(showsIndicators: false) {
        LazyVStack(spacing: 10) {
          Text(EchoCopy.format("%lld results", model.results.count))
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.38))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 2)
          ForEach(model.results) { message in
            EchoServerMessageSearchResult(
              message: message,
              channelName: model.channelName(for: message.channelID),
              baseURL: baseURL
            ) {
              jump(to: message)
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

  private func jump(to message: EchoMessage) {
    let channelID = message.channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !channelID.isEmpty else { return }
    shellChrome.requestOpenGuild(
      serverID: server.id,
      channelID: channelID,
      messageID: message.id
    )
    closeSearch()
  }

  private func closeSearch() {
    if let onClose {
      onClose()
    } else {
      dismiss()
    }
  }

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    #if canImport(UIKit)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  private func serverSearchEmpty(systemImage: String, title: String, message: String) -> some View {
    VStack(spacing: 12) {
      Image(systemName: systemImage)
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .frame(width: 58, height: 58)
        .background(EchoTheme.Color.ink(0.08), in: Circle())
      Text(title)
        .font(.system(size: 17, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.92))
      Text(message)
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 280)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.bottom, 80)
  }
}

private struct EchoServerMessageSearchFilters: View {
  @Bindable var model: EchoServerMessageSearchModel
  var onChange: () -> Void = {}

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        EchoSearchFilterChip(
          title: EchoCopy.string("You"),
          systemImage: "person.fill",
          selected: model.authorMeOnly
        ) {
          model.toggleAuthorMeOnly()
          onChange()
        }
        EchoSearchFilterChip(
          title: EchoCopy.string("Mentions you"),
          systemImage: "at",
          selected: model.mentionsMe
        ) {
          model.toggleMentionsMe()
          onChange()
        }
        EchoSearchFilterChip(
          title: EchoCopy.string("Files"),
          systemImage: "paperclip",
          selected: model.hasAttachment
        ) {
          model.toggleHasAttachment()
          onChange()
        }
        Capsule()
          .fill(EchoTheme.Color.ink(0.12))
          .frame(width: 1, height: 18)
          .padding(.horizontal, 2)
        ForEach(EchoMessageSearchHasType.allCases, id: \.self) { type in
          EchoSearchFilterChip(
            title: type.chipTitle,
            systemImage: type.systemImage,
            selected: model.hasType == type
          ) {
            model.toggleHasType(type)
            onChange()
          }
        }
        if model.hasActiveCriteria {
          Capsule()
            .fill(EchoTheme.Color.ink(0.12))
            .frame(width: 1, height: 18)
            .padding(.horizontal, 2)
          Button {
            model.clearFilters()
            onChange()
          } label: {
            Text(EchoCopy.string("Clear filters"))
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
              .padding(.horizontal, 10)
              .frame(height: 32)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Clear filters"))
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 2)
    }
  }
}

private struct EchoServerMessageSearchResult: View {
  let message: EchoMessage
  let channelName: String?
  let baseURL: URL
  let onSelect: () -> Void
  @Environment(EchoAuthenticationModel.self) private var auth

  private var accessToken: String? { auth.activeSession?.accessToken }

  private var displayContent: String {
    EchoGifHostLinks.contentWithoutInlineGifHostURLs(message.content, embeds: message.embeds)
  }

  var body: some View {
    Button(action: onSelect) {
      HStack(alignment: .top, spacing: 11) {
        EchoMediaImage(
          source: message.authorAvatarURL,
          baseURL: baseURL,
          accessToken: accessToken
        ) {
          EchoGeneratedAvatar(
            name: message.authorDisplayName ?? message.authorID,
            seed: message.authorID
          )
        }
        .clipShape(Circle())
        .frame(width: 34, height: 34)

        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(message.authorDisplayName ?? message.authorID)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.9))
              .lineLimit(1)
            if let channelName, !channelName.isEmpty {
              Text(EchoCopy.format("#%@", channelName))
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
                .lineLimit(1)
            }
            Spacer(minLength: 4)
            if let timestamp = message.timestamp {
              Text(EchoMessageTimestampFormatter.string(from: timestamp))
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.38))
            }
          }
          Text(displayContent.isEmpty ? EchoCopy.string("Empty message") : displayContent)
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .lineLimit(3)
            .multilineTextAlignment(.leading)
        }
      }
      .padding(12)
      .background(
        EchoTheme.Color.ink(0.04),
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(EchoTheme.Color.ink(0.06), lineWidth: 1)
      }
      .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.string("Jump to message"))
  }
}
