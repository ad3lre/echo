import Observation
import SwiftUI

/// Shell chrome knobs for tab bar suppress, Duo layout, and Servers back.
@MainActor
@Observable
final class EchoShellChrome {
  /// Immersive guild chat — hide the floating tab bar.
  var immersiveGuildChat = false
  /// List search focus (Home / Servers / Explore) — hide the floating tab bar.
  var listSearchActive = false
  /// Bumped when the user re-taps Servers while already on that tab — nested
  /// surfaces pop one level (chat → channel list → server list).
  private(set) var serversBackRequest = 0
  /// Bumped on tab switch so keep-alive tabs resign list search (focus can
  /// otherwise survive while `listSearchActive` was cleared).
  private(set) var resignListSearchRequest = 0
  /// Latest Duo / wide layout measurement from ``EchoDuoLayoutReader``.
  var layout = EchoDuoLayout()

  var suppressTabBar: Bool {
    immersiveGuildChat || listSearchActive
  }

  func requestServersBack() {
    serversBackRequest &+= 1
  }

  func clearListSearch() {
    listSearchActive = false
  }

  func requestResignListSearch() {
    resignListSearchRequest &+= 1
    listSearchActive = false
  }
}
