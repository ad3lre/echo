import Foundation

/// Phone shell tabs — mirrors web `MobileBottomTabId` + web icon set.
enum EchoMainTab: String, CaseIterable, Identifiable, Hashable {
  case home
  case servers
  case explore

  var id: Self { self }

  /// Short label under the icon.
  var title: String {
    switch self {
    case .home: EchoCopy.string("Chat")
    case .servers: EchoCopy.string("Servers")
    case .explore: EchoCopy.string("Explore")
    }
  }

  /// Asset catalog names — same artwork as web `icons.message` / `community` / `explore`.
  var assetName: String {
    switch self {
    case .home: "EchoTabMessage"
    case .servers: "EchoTabCommunity"
    // Takeoff rocket for both states — matches web rail / Explore chrome.
    case .explore: "EchoTabExploreFilled"
    }
  }

  var assetNameSelected: String {
    switch self {
    case .home: "EchoTabMessageFilled"
    case .servers: "EchoTabCommunityFilled"
    case .explore: "EchoTabExploreFilled"
    }
  }
}
