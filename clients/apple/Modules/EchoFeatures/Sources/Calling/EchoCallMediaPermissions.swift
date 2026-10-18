import Foundation

#if os(iOS)
  import AVFoundation
#endif

/// TCC prompts for call media. Kept out of `EchoCallModel` so the call state
/// machine stays under the maintainability LOC budget.
enum EchoCallMediaPermissions {
  @MainActor
  static func ensureMicrophoneAccess() async throws {
    #if os(iOS)
      // Use AVAudioApplication's async API — bridging
      // `AVAudioSession.requestRecordPermission` with a MainActor-isolated
      // continuation crashes when TCC invokes the callback off-main.
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        return
      case .denied:
        throw EchoCallTransportError.microphoneDenied
      case .undetermined:
        guard await AVAudioApplication.requestRecordPermission() else {
          throw EchoCallTransportError.microphoneDenied
        }
      @unknown default:
        return
      }
    #endif
  }

  @MainActor
  static func ensureCameraAccess() async throws {
    #if os(iOS)
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized:
        return
      case .denied, .restricted:
        throw EchoCallTransportError.cameraDenied
      case .notDetermined:
        guard await AVCaptureDevice.requestAccess(for: .video) else {
          throw EchoCallTransportError.cameraDenied
        }
      @unknown default:
        return
      }
    #endif
  }
}
