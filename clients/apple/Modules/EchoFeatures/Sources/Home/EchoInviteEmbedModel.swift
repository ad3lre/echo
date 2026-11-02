import EchoDomain
import EchoNetworking
import Foundation
import Observation

/// Loads one invite preview and joins through the existing invite join API.
@MainActor
@Observable
final class EchoInviteEmbedModel {
  let token: String
  let voiceChannelID: String?
  private(set) var preview: EchoInvitePreview?
  private(set) var isLoading = true
  private(set) var isJoining = false
  private(set) var hasJoined = false
  private(set) var note: String?
  private(set) var joinFailed = false
  @ObservationIgnored private let client: EchoWorkspaceClient
  @ObservationIgnored private let auth: EchoAuthenticationModel

  init(link: String, baseURL: URL, auth: EchoAuthenticationModel) {
    token = EchoWorkspaceClient.inviteToken(from: link)
    voiceChannelID = EchoInviteShareURL.voiceChannelID(from: link)
    client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
  }

  func loadPreview() async {
    isLoading = true
    preview = await client.loadInvitePreview(
      inviteToken: token, voiceChannelID: voiceChannelID)
    isLoading = false
  }

  func subtitle(_ preview: EchoInvitePreview) -> String {
    var bits: [String] = []
    if preview.isVoiceInvite {
      bits.append(preview.voiceChannelName ?? EchoCopy.string("Voice channel"))
    }
    if preview.memberCount > 0 {
      bits.append(
        EchoCopy.format(
          preview.memberCount == 1 ? "%d member" : "%d members", preview.memberCount))
    }
    return bits.isEmpty ? "Echo" : bits.joined(separator: " · ")
  }

  func join() async {
    guard !isJoining, !hasJoined else { return }
    isJoining = true
    joinFailed = false
    note = nil
    defer { isJoining = false }
    do {
      let result = try await auth.withAccessTokenRetry { [client, token] accessToken in
        try await client.joinInvite(inviteToken: token, accessToken: accessToken)
      }
      hasJoined = true
      note = EchoCopy.string(result.alreadyMember ? "You’re already in this server" : "Joined server")
    } catch {
      joinFailed = true
      note =
        (error as? EchoHomeClientError)?.isApplicationRequired == true
        ? EchoCopy.string("This server requires an application to join")
        : EchoCopy.string("Couldn’t join that server")
    }
  }
}
