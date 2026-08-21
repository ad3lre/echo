import EchoNetworking
import SwiftUI

/// Retries work when the process becomes active or the network path recovers.
struct EchoNetworkRecoveryModifier: ViewModifier {
  @Environment(\.scenePhase) private var scenePhase
  var enabled = true
  let action: () -> Void

  func body(content: Content) -> some View {
    content
      .onChange(of: scenePhase) { _, phase in
        guard enabled, phase == .active else { return }
        action()
      }
      .onReceive(NotificationCenter.default.publisher(for: EchoNetworkPath.becameAvailable)) { _ in
        guard enabled else { return }
        action()
      }
  }
}

extension View {
  func echoRetryOnNetworkRecovery(enabled: Bool = true, perform action: @escaping () -> Void)
    -> some View
  {
    modifier(EchoNetworkRecoveryModifier(enabled: enabled, action: action))
  }
}
