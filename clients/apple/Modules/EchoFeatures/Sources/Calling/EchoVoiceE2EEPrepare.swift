import Foundation

/// Result of client-side voice E2EE prepare before LiveKit session mint.
struct EchoVoiceE2EEPrepareResult: Sendable, Equatable {
  /// Media keys for LiveKit frame encryption. `nil` only when the server does
  /// not require voice E2EE for this channel.
  var encryption: EchoCallMediaEncryption?
  /// Local E2EE device id forwarded to `livekit-session` for envelope checks.
  var deviceID: String?

  var hasMaterial: Bool { encryption?.hasMaterial == true }
}

/// Produces LiveKit media keys before the room token is used. Production DM
/// calls require this; returning empty material is only valid when the server
/// reports `voiceE2ee.required == false`.
protocol EchoVoiceE2EEPreparing: Sendable {
  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult

  func prepareGuild(
    serverID: String,
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult
}

/// Runs Element Call–style media-key prepare inside an offscreen WKWebView so
/// Apple derives the same LiveKit sender keys as the web client.
///
/// When the server has voice E2EE disabled, prepare returns empty material
/// (not an error) so the call can continue unencrypted.
struct EchoVoiceE2EEMlsPreparer: EchoVoiceE2EEPreparing {
  let baseURL: URL

  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult {
    let deviceID = EchoMlsKeychain.deviceID(forUserID: viewerUserID)
    var authorized = authorizedUserIDs
    if let peer = peerUserID { authorized.append(peer) }
    authorized.append(viewerUserID)
    do {
      return try await EchoMlsJsRuntime.shared.prepareDM(
        channelID: channelID,
        accessToken: accessToken,
        viewerUserID: viewerUserID,
        deviceID: deviceID,
        peerUserID: peerUserID,
        authorizedUserIDs: authorized,
        baseURL: baseURL)
    } catch {
      return try Self.mapDisabled(error, deviceID: deviceID)
    }
  }

  func prepareGuild(
    serverID: String,
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult {
    let deviceID = EchoMlsKeychain.deviceID(forUserID: viewerUserID)
    var authorized = authorizedUserIDs
    authorized.append(viewerUserID)
    do {
      return try await EchoMlsJsRuntime.shared.prepareDM(
        channelID: channelID,
        accessToken: accessToken,
        viewerUserID: viewerUserID,
        deviceID: deviceID,
        peerUserID: nil,
        authorizedUserIDs: authorized,
        baseURL: baseURL,
        serverID: serverID)
    } catch {
      return try Self.mapDisabled(error, deviceID: deviceID)
    }
  }

  private static func mapDisabled(_ error: Error, deviceID: String) throws
    -> EchoVoiceE2EEPrepareResult
  {
    let message = error.localizedDescription.lowercased()
    if message.contains("voice e2ee is not enabled") || message.contains("voice_e2ee_disabled") {
      return EchoVoiceE2EEPrepareResult(encryption: nil, deviceID: deviceID)
    }
    throw error
  }
}

/// Test double / fallback when the MLS bridge is unavailable.
struct EchoVoiceE2EEUnavailablePreparer: EchoVoiceE2EEPreparing {
  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult {
    EchoVoiceE2EEPrepareResult(encryption: nil, deviceID: nil)
  }

  func prepareGuild(
    serverID: String,
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    authorizedUserIDs: [String]
  ) async throws -> EchoVoiceE2EEPrepareResult {
    EchoVoiceE2EEPrepareResult(encryption: nil, deviceID: nil)
  }
}
