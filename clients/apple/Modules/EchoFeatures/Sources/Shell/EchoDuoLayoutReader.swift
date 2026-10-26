import SwiftUI

/// Shell-level Duo geometry publisher.
///
/// Prefer attaching via ``EchoMainShellView`` so every tab shares one
/// ``EchoShellChrome/layout``. Uses size classes + safe-area asymmetry +
/// reserved-region bridge (when the Duo SDK is linked).
struct EchoDuoLayoutProbe: View {
  /// Passed explicitly — `.background` siblings do not inherit `.environment`
  /// applied earlier on the same modifier chain (crashes on launch).
  var shellChrome: EchoShellChrome
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.verticalSizeClass) private var verticalSizeClass

  var body: some View {
    GeometryReader { proxy in
      Color.clear
        .accessibilityHidden(true)
        .onAppear { publish(proxy) }
        .onChange(of: proxy.size) { _, _ in publish(proxy) }
        .onChange(of: horizontalSizeClass) { _, _ in publish(proxy) }
        .onChange(of: verticalSizeClass) { _, _ in publish(proxy) }
        .task(id: proxySafeAreaKey(proxy)) { publish(proxy) }
    }
    .allowsHitTesting(false)
  }

  private func proxySafeAreaKey(_ proxy: GeometryProxy) -> String {
    let i = proxy.safeAreaInsets
    return "\(i.top),\(i.leading),\(i.bottom),\(i.trailing)"
  }

  private func publish(_ proxy: GeometryProxy) {
    let next = EchoDuoLayout.measure(
      size: proxy.size,
      safeAreaInsets: proxy.safeAreaInsets,
      horizontalSizeClass: horizontalSizeClass,
      verticalSizeClass: verticalSizeClass,
      division: EchoDuoReservedRegionsBridge.division(from: proxy),
      occlusions: EchoDuoReservedRegionsBridge.occlusions(from: proxy)
    )
    if next != shellChrome.layout {
      shellChrome.layout = next
    }
  }
}
