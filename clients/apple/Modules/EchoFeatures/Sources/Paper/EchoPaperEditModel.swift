import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Single-author paper editing: load raw JSON → edit text blocks → `PATCH` with `expectedRevision`.
@MainActor
@Observable
final class EchoPaperEditModel {
  let channelID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  var draft: EchoPaperDraft?
  private(set) var baseRevision = 0
  private(set) var isBusy = false
  private(set) var errorMessage: String?
  /// Set when the server answered 409: someone saved a newer revision.
  var showsConflict = false

  init(channelID: String, client: EchoWorkspaceClient, auth: EchoAuthenticationModel) {
    self.channelID = channelID
    self.client = client
    self.auth = auth
  }

  var isDirty: Bool { draft?.isDirty == true }

  /// Fetches the latest raw document and replaces the draft (discarding local edits).
  func load() async -> Bool {
    isBusy = true
    errorMessage = nil
    defer { isBusy = false }
    do {
      let token = try await auth.ensureAccessToken()
      let raw = try await client.fetchPaperRaw(channelID: channelID, accessToken: token)
      guard let next = EchoPaperDraft(contentJSON: raw.contentJSON) else {
        errorMessage = EchoCopy.string("Echo couldn’t open this paper for editing.")
        return false
      }
      draft = next
      baseRevision = raw.revision
      return true
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t open this paper for editing.")
      return false
    }
  }

  /// "Keep my edits": adopt the server's newest revision but keep the local draft, then save.
  func retryOnLatest() async -> EchoPaperDocument? {
    do {
      let token = try await auth.ensureAccessToken()
      let raw = try await client.fetchPaperRaw(channelID: channelID, accessToken: token)
      baseRevision = raw.revision
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t save this paper.")
      return nil
    }
    return await save()
  }

  func save() async -> EchoPaperDocument? {
    guard let data = draft?.encoded() else { return nil }
    isBusy = true
    errorMessage = nil
    defer { isBusy = false }
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.savePaperDocument(
        channelID: channelID, contentJSON: data, expectedRevision: baseRevision,
        accessToken: token)
    } catch let error as EchoHomeClientError where error.isPaperRevisionConflict {
      showsConflict = true
      return nil
    } catch {
      errorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save this paper."))
      return nil
    }
  }
}
