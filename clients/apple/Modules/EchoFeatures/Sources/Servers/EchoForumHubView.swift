import EchoDomain
import EchoNetworking
import SwiftUI

/// Forum channel hub: post browse (search / list·grid / covers), sort, create, pin/lock/archive.
struct EchoForumHubView: View {
  let server: EchoServerSummary
  let forum: EchoGuildChannel
  let model: EchoForumHubModel
  let baseURL: URL
  var accessToken: String? = nil
  /// Channel-manage capability for this forum (web `canManageForumPosts`).
  var canManageForum: Bool = false
  var currentUserID: String? = nil
  var onOpenPost: (EchoForumPost) -> Void
  var onOpenCreated: (String) -> Void
  var onRequestExit: (() -> Void)? = nil

  @State private var showingCompose = false
  @State private var searchQuery = ""
  @State private var viewMode: EchoForumBrowse.ViewMode = .list

  private var visiblePosts: [EchoForumPost] {
    EchoForumBrowse.filtered(model.orderedPosts, query: searchQuery)
  }

  private var hasSearch: Bool {
    !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      browseBar
      if let patchError = model.patchErrorMessage {
        Text(patchError)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.mentionPing)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .padding(.bottom, 6)
      }
      content
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task(id: "\(model.sort.rawValue)|\(model.includeArchived)") { await model.reload() }
    .sheet(isPresented: $showingCompose) {
      EchoForumPostComposeSheet(forumName: forum.name, model: model) { channelID in
        onOpenCreated(channelID)
      }
    }
  }

  private var header: some View {
    HStack(spacing: 10) {
      if let onRequestExit {
        Button(action: onRequestExit) {
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Show channels"))
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(forum.name)
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.96))
          .lineLimit(1)
        Text(server.name)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      sortMenu
      viewModeToggle
      if canManageForum {
        archivedToggle
      }
      Button {
        showingCompose = true
      } label: {
        Label(EchoCopy.string("New post"), systemImage: "plus")
          .labelStyle(.titleAndIcon)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.onAccent)
          .padding(.horizontal, 12)
          .frame(height: 32)
          .background(EchoTheme.Color.indigoDeep, in: Capsule())
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 8)
  }

  private var browseBar: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      TextField(EchoCopy.string("Search posts…"), text: $searchQuery)
        .textFieldStyle(.plain)
        .font(.system(size: 14, design: .rounded))
      if hasSearch {
        Button {
          searchQuery = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.36))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Clear search"))
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 9)
    .background(EchoTheme.Color.ink(0.06), in: Capsule())
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
  }

  private var sortMenu: some View {
    Menu {
      Picker(EchoCopy.string("Sort posts"), selection: Bindable(model).sort) {
        Text(EchoCopy.string("Latest activity")).tag(EchoForumPostSort.latestActivity)
        Text(EchoCopy.string("Creation date")).tag(EchoForumPostSort.creationDate)
      }
    } label: {
      Image(systemName: "arrow.up.arrow.down")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .frame(width: 34, height: 34)
        .background(EchoTheme.Color.ink(0.08), in: Circle())
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
    .fixedSize()
    .accessibilityLabel(EchoCopy.string("Sort posts"))
  }

  private var viewModeToggle: some View {
    Button {
      viewMode = viewMode == .list ? .grid : .list
    } label: {
      Image(systemName: viewMode == .grid ? "square.grid.2x2.fill" : "list.bullet")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .frame(width: 34, height: 34)
        .background(EchoTheme.Color.ink(0.08), in: Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      EchoCopy.string(viewMode == .grid ? "Grid" : "List"))
  }

  private var archivedToggle: some View {
    Button {
      model.includeArchived.toggle()
    } label: {
      Image(systemName: model.includeArchived ? "archivebox.fill" : "archivebox")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(
          model.includeArchived ? EchoTheme.Color.indigoSoft : EchoTheme.Color.ink(0.72)
        )
        .frame(width: 34, height: 34)
        .background(EchoTheme.Color.ink(0.08), in: Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      EchoCopy.string(model.includeArchived ? "Hide archived posts" : "Show archived posts"))
  }

  @ViewBuilder
  private var content: some View {
    if model.isLoading && model.posts.isEmpty {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if let error = model.errorMessage, model.posts.isEmpty {
      placeholder(icon: "exclamationmark.triangle", title: error, detail: nil)
    } else if model.posts.isEmpty {
      placeholder(
        icon: "text.bubble",
        title: EchoCopy.string("No posts yet"),
        detail: EchoCopy.string("Start the first conversation in this forum."))
    } else if visiblePosts.isEmpty {
      placeholder(
        icon: "magnifyingglass",
        title: EchoCopy.string("No matching posts"),
        detail: EchoCopy.string("Try a different search, or clear it to see everything."))
    } else {
      ScrollView(showsIndicators: false) {
        Group {
          if viewMode == .grid {
            LazyVGrid(
              columns: [
                GridItem(.adaptive(minimum: 220, maximum: 360), spacing: 10)
              ],
              spacing: 10
            ) {
              ForEach(visiblePosts) { post in
                postButton(post)
              }
            }
          } else {
            LazyVStack(spacing: 8) {
              ForEach(visiblePosts) { post in
                postButton(post)
              }
            }
          }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 24)
      }
      .refreshable { await model.reload() }
    }
  }

  private func postButton(_ post: EchoForumPost) -> some View {
    Button {
      onOpenPost(post)
    } label: {
      EchoForumPostCard(
        post: post, viewMode: viewMode, baseURL: baseURL, accessToken: accessToken)
    }
    .buttonStyle(.plain)
    .contextMenu { postContextMenu(post) }
  }

  @ViewBuilder
  private func postContextMenu(_ post: EchoForumPost) -> some View {
    Button {
      onOpenPost(post)
    } label: {
      Label(EchoCopy.string("Open post"), systemImage: "text.bubble")
    }
    if canModerate(post) {
      Divider()
      Button {
        Task { await model.togglePinned(post) }
      } label: {
        Label(
          EchoCopy.string(post.pinned ? "Unpin post" : "Pin post"),
          systemImage: post.pinned ? "pin.slash" : "pin")
      }
      Button {
        Task { await model.toggleLocked(post) }
      } label: {
        Label(
          EchoCopy.string(post.locked ? "Unlock post" : "Lock post"),
          systemImage: post.locked ? "lock.open" : "lock")
      }
      Button {
        Task { await model.toggleArchived(post) }
      } label: {
        Label(
          EchoCopy.string(post.isArchived ? "Restore post" : "Archive post"),
          systemImage: post.isArchived ? "arrow.uturn.backward" : "archivebox")
      }
    }
  }

  /// Web `viewerCanModerateForumPost`: channel manage, or post author with `managePostFlags`.
  private func canModerate(_ post: EchoForumPost) -> Bool {
    if canManageForum { return true }
    guard let currentUserID, let author = post.createdByUserID else { return false }
    guard EchoUserIdentity.matches(currentUserID, author) else { return false }
    return forum.forumCreatorPerms.managePostFlags
  }

  private func placeholder(icon: String, title: String, detail: String?) -> some View {
    VStack(spacing: 10) {
      Image(systemName: icon)
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(EchoTheme.Color.indigoSoft)
        .frame(width: 58, height: 58)
        .background(EchoTheme.Color.indigo.opacity(0.14), in: Circle())
      Text(title)
        .font(.system(size: 16, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.9))
        .multilineTextAlignment(.center)
      if let detail {
        Text(detail)
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .multilineTextAlignment(.center)
      }
      if hasSearch {
        Button(EchoCopy.string("Clear search")) { searchQuery = "" }
          .buttonStyle(.bordered)
          .padding(.top, 4)
      }
    }
    .padding(.horizontal, 28)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// Owns the per-forum hub model so the list survives conversation round-trips in one session.
struct EchoForumHubHost: View {
  let server: EchoServerSummary
  let forum: EchoGuildChannel
  let servers: EchoServersModel
  var onOpenPost: (EchoForumPost) -> Void
  var onOpenCreated: (String) -> Void
  var onRequestExit: (() -> Void)? = nil
  @State private var hub: EchoForumHubModel?

  var body: some View {
    Group {
      if let hub {
        EchoForumHubView(
          server: server,
          forum: forum,
          model: hub,
          baseURL: servers.client.baseURL,
          accessToken: servers.auth.activeSession?.accessToken,
          canManageForum: servers.canManageChannel(forum.id, server: server),
          currentUserID: servers.currentUserID,
          onOpenPost: onOpenPost,
          onOpenCreated: onOpenCreated,
          onRequestExit: onRequestExit
        )
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .onAppear {
      if hub == nil {
        hub = EchoForumHubModel(
          forumChannelID: forum.id, client: servers.client, auth: servers.auth)
      }
    }
    .task(id: forum.id) {
      await servers.refreshChannelCapabilities(channelID: forum.id)
    }
  }
}
