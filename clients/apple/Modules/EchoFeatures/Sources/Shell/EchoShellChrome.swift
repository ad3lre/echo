import Observation
import SwiftUI

/// Shell chrome knobs for full-screen server surfaces (tab bar suppress, etc.).
@MainActor
@Observable
final class EchoShellChrome {
  /// When true, the floating phone tab bar is hidden (immersive server / chat).
  var suppressTabBar = false
}
