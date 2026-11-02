import EchoDomain
import SwiftUI

extension EchoMessageComposer {
  /// Stickers send immediately (web picker parity) and leave any typed draft untouched.
  @MainActor
  func sendSticker(_ sticker: EchoServerSticker) async {
    guard !state.isSending else { return }
    state.isSending = true
    state.errorMessage = nil
    state.panel = nil
    defer { state.isSending = false }
    do {
      try await onSend(
        EchoComposerSubmission(
          text: "", assets: [], gif: nil, poll: nil, replyTo: replyTo, sticker: sticker))
      replyTo = nil
      state.replyTo = nil
    } catch {
      state.errorMessage = sendFailureMessage(
        error, fallback: EchoCopy.string("Message failed to send."))
    }
  }
}
