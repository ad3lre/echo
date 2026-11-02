import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Paper comments for one channel (web `usePaperComments`).
@MainActor
@Observable
final class EchoPaperCommentsModel {
  /// Document-level anchor when the native editor has no TipTap selection.
  static let documentAnchorID = "paper-root"

  let channelID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var comments: [EchoPaperComment] = []
  private(set) var isLoading = false
  private(set) var isMutating = false
  private(set) var errorMessage: String?
  private(set) var loadForbidden = false
  var draft = ""
  var replyDraft = ""
  var replyParentID: String?

  var canComment = false
  var canManage = false
  var currentUserID: String?

  init(channelID: String, client: EchoWorkspaceClient, auth: EchoAuthenticationModel) {
    self.channelID = channelID
    self.client = client
    self.auth = auth
  }

  var topLevel: [EchoPaperComment] {
    comments.filter(\.isTopLevel).sorted { $0.createdAt < $1.createdAt }
  }

  func replies(for parentID: String) -> [EchoPaperComment] {
    comments.filter { $0.parentCommentID == parentID }.sorted { $0.createdAt < $1.createdAt }
  }

  func adoptCapabilities(from document: EchoPaperDocument?) {
    canComment = document?.canCommentOnPaper == true && document?.paperCommentsEnabled != false
    canManage = document?.canManagePaperComments == true
  }

  func reload() async {
    isLoading = true
    errorMessage = nil
    loadForbidden = false
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      currentUserID = auth.activeSession?.userID
      comments = try await client.fetchPaperComments(channelID: channelID, accessToken: token)
    } catch {
      if case EchoHomeClientError.server(let status, _, _) = error, status == 403 {
        loadForbidden = true
        comments = []
      } else {
        errorMessage = EchoCopy.string("Echo couldn’t load comments.")
      }
    }
  }

  func addComment() async {
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canComment, !body.isEmpty else { return }
    await mutate {
      let created = try await client.createPaperComment(
        channelID: channelID,
        body: body,
        anchorBlockID: Self.documentAnchorID,
        accessToken: try await auth.ensureAccessToken())
      comments.append(created)
      draft = ""
    }
  }

  func addReply(to parent: EchoPaperComment) async {
    let body = replyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canComment, !body.isEmpty else { return }
    await mutate {
      let created = try await client.createPaperComment(
        channelID: channelID,
        body: body,
        anchorBlockID: parent.anchorBlockID,
        anchorFrom: parent.anchorFrom,
        anchorTo: parent.anchorTo,
        anchorQuote: parent.anchorQuote,
        parentCommentID: parent.id,
        accessToken: try await auth.ensureAccessToken())
      comments.append(created)
      replyDraft = ""
      replyParentID = nil
    }
  }

  func toggleResolved(_ comment: EchoPaperComment) async {
    guard canManage || EchoUserIdentity.matches(currentUserID, comment.authorID) else { return }
    await mutate {
      let updated = try await client.patchPaperComment(
        channelID: channelID,
        commentID: comment.id,
        resolve: comment.isResolved ? nil : true,
        unresolve: comment.isResolved ? true : nil,
        accessToken: try await auth.ensureAccessToken())
      if let index = comments.firstIndex(where: { $0.id == comment.id }) {
        comments[index] = updated
      }
    }
  }

  func remove(_ comment: EchoPaperComment) async {
    guard canManage || EchoUserIdentity.matches(currentUserID, comment.authorID) else { return }
    await mutate {
      try await client.deletePaperComment(
        channelID: channelID, commentID: comment.id,
        accessToken: try await auth.ensureAccessToken())
      comments.removeAll { $0.id == comment.id || $0.parentCommentID == comment.id }
    }
  }

  private func mutate(_ work: () async throws -> Void) async {
    isMutating = true
    errorMessage = nil
    defer { isMutating = false }
    do { try await work() } catch {
      errorMessage = EchoCopy.string("Echo couldn’t update that comment.")
    }
  }
}
