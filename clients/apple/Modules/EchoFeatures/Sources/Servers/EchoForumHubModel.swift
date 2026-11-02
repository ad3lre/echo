import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Loads, creates, and moderates posts for one forum channel (web `useForumPostsController`).
@MainActor
@Observable
final class EchoForumHubModel {
  let forumChannelID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var posts: [EchoForumPost] = []
  private(set) var isLoading = false
  private(set) var isCreating = false
  private(set) var isPatching = false
  private(set) var errorMessage: String?
  var createErrorMessage: String?
  var patchErrorMessage: String?
  var sort: EchoForumPostSort = .latestActivity
  /// When true, list includes archived posts (web `includeArchived`).
  var includeArchived = false

  init(forumChannelID: String, client: EchoWorkspaceClient, auth: EchoAuthenticationModel) {
    self.forumChannelID = forumChannelID
    self.client = client
    self.auth = auth
  }

  /// Pinned posts float first, then the server-provided sort order.
  var orderedPosts: [EchoForumPost] {
    posts.filter(\.pinned) + posts.filter { !$0.pinned }
  }

  func reload() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      posts = try await client.loadForumPosts(
        forumChannelID: forumChannelID,
        sort: sort,
        includeArchived: includeArchived,
        accessToken: token)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load forum posts.")
    }
  }

  /// Returns the new post's channel id on success.
  func createPost(title: String, body: String) async -> String? {
    let heading = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let details = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !heading.isEmpty else {
      createErrorMessage = EchoCopy.string("Enter a post title.")
      return nil
    }
    // The server derives the title from the first non-empty line of `content`.
    let content = details.isEmpty ? heading : "\(heading)\n\n\(details)"
    isCreating = true
    createErrorMessage = nil
    defer { isCreating = false }
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.createForumPost(
        forumChannelID: forumChannelID, content: content, accessToken: token)
    } catch {
      createErrorMessage = EchoCopy.string("Echo couldn’t create that post.")
      return nil
    }
  }

  func togglePinned(_ post: EchoForumPost) async {
    await patch(post, pinned: !post.pinned)
  }

  func toggleLocked(_ post: EchoForumPost) async {
    await patch(post, locked: !post.locked)
  }

  func toggleArchived(_ post: EchoForumPost) async {
    let archivedAt: EchoPatchValue<String> =
      post.isArchived ? .clear : .set(ISO8601DateFormatter().string(from: Date()))
    await patch(post, archivedAt: archivedAt)
  }

  private func patch(
    _ post: EchoForumPost,
    pinned: Bool? = nil,
    locked: Bool? = nil,
    archivedAt: EchoPatchValue<String>? = nil
  ) async {
    isPatching = true
    patchErrorMessage = nil
    defer { isPatching = false }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.patchForumPost(
        postChannelID: post.id,
        pinned: pinned,
        locked: locked,
        archivedAt: archivedAt,
        accessToken: token)
      // Optimistic local merge, then refresh so archive hide/show matches the server.
      let nextArchived: String?? =
        switch archivedAt {
        case .set(let value): .some(.some(value))
        case .clear: .some(.none)
        case nil: .none
        }
      if let index = posts.firstIndex(where: { $0.id == post.id }) {
        posts[index] = posts[index].with(
          pinned: pinned, locked: locked, archivedAt: nextArchived)
        if !includeArchived, posts[index].isArchived {
          posts.remove(at: index)
        }
      }
      await reload()
    } catch {
      patchErrorMessage = EchoCopy.string("Echo couldn’t update that post.")
    }
  }
}
