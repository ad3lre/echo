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
    peerUserID: String?
  ) async throws -> EchoVoiceE2EEPrepareResult
}

/// Runs Echo's ts-mls group create/join inside an offscreen WKWebView so Apple
/// derives the same media keys as the web client.
struct EchoVoiceE2EEMlsPreparer: EchoVoiceE2EEPreparing {
  let baseURL: URL

  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?
  ) async throws -> EchoVoiceE2EEPrepareResult {
    let deviceID = EchoMlsKeychain.deviceID(forUserID: viewerUserID)
    do {
      return try await EchoMlsJsRuntime.shared.prepareDM(
        channelID: channelID,
        accessToken: accessToken,
        viewerUserID: viewerUserID,
        deviceID: deviceID,
        peerUserID: peerUserID,
        baseURL: baseURL)
    } catch {
      // When the server disables voice E2EE, mlsGroupClient throws a disabled
      // error — treat that as "no material" so transport-only calls proceed.
      let message = error.localizedDescription.lowercased()
      if message.contains("voice e2ee is not enabled") || message.contains("voice_e2ee_disabled") {
        return EchoVoiceE2EEPrepareResult(encryption: nil, deviceID: deviceID)
      }
      throw error
    }
  }
}

/// Test double / fallback when the MLS bridge is unavailable.
struct EchoVoiceE2EEUnavailablePreparer: EchoVoiceE2EEPreparing {
  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    peerUserID: String?
  ) async throws -> EchoVoiceE2EEPrepareResult {
    EchoVoiceE2EEPrepareResult(encryption: nil, deviceID: nil)
  }
}
