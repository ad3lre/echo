import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Member self-assignable roles for one server (web `useServerSelfRolesStore` panel + toggle).
@MainActor
@Observable
final class EchoSelfRolesModel {
  let serverID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var panel: EchoSelfRolesPanel?
  private(set) var isLoading = false
  private(set) var busyRoleID: String?
  var errorMessage: String?

  init(serverID: String, client: EchoWorkspaceClient, auth: EchoAuthenticationModel) {
    self.serverID = serverID
    self.client = client
    self.auth = auth
  }

  func load() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      panel = try await client.loadSelfRolesPanel(serverID: serverID, accessToken: token)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load self-assignable roles.")
    }
  }

  func toggle(roleID: String, assign: Bool) async {
    guard busyRoleID == nil else { return }
    busyRoleID = roleID
    errorMessage = nil
    defer { busyRoleID = nil }
    do {
      let token = try await auth.ensureAccessToken()
      if let next = try await client.toggleSelfRole(
        serverID: serverID, roleID: roleID, assign: assign, accessToken: token)
      {
        panel = next
      } else {
        panel = try await client.loadSelfRolesPanel(serverID: serverID, accessToken: token)
      }
    } catch let error as EchoHomeClientError {
      if case .server(_, _, let message) = error, let message, !message.isEmpty {
        errorMessage = message
      } else {
        errorMessage = EchoCopy.string("Echo couldn’t update that role.")
      }
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t update that role.")
    }
  }
}
