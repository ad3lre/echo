import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

/// Paper share settings for one channel (web `usePaperShare`).
@MainActor
@Observable
final class EchoPaperShareModel {
  let channelID: String
  let serverID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel
  private let webBase: URL

  private(set) var settings: EchoPaperShareSettings?
  private(set) var isLoading = false
  private(set) var isSaving = false
  private(set) var errorMessage: String?
  private(set) var didCopyLink = false

  init(
    channelID: String,
    serverID: String,
    client: EchoWorkspaceClient,
    auth: EchoAuthenticationModel,
    webBase: URL = EchoAPIConfiguration.baseURL()
  ) {
    self.channelID = channelID
    self.serverID = serverID
    self.client = client
    self.auth = auth
    self.webBase = webBase
  }

  var shareLink: String {
    settings?.preferredLink(webBase: webBase) ?? ""
  }

  func reload() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      settings = try await client.fetchPaperShareSettings(
        channelID: channelID, accessToken: token)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load share settings.")
      settings = nil
    }
  }

  func setVisibility(_ visibility: EchoPaperShareVisibility) async {
    guard settings?.canManageShare == true, settings?.visibility != visibility else { return }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      let token = try await auth.ensureAccessToken()
      settings = try await client.patchPaperShareVisibility(
        channelID: channelID, visibility: visibility, accessToken: token)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t update share settings.")
    }
  }

  func copyLink() {
    let link = shareLink
    guard !link.isEmpty else { return }
    #if canImport(UIKit)
      UIPasteboard.general.string = link
    #elseif canImport(AppKit)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(link, forType: .string)
    #endif
    didCopyLink = true
  }
}
