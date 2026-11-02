import EchoDomain
import Foundation

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Guild channel sidebar context menu helpers (web `ChannelPanelContextMenu`).
enum EchoChannelRowMenu {
  /// `{origin}/channels/{serverId}/{channelId}` — web `channelMenuCopyLink`.
  static func channelLink(baseURL: URL, serverID: String, channelID: String) -> URL {
    baseURL
      .appendingPathComponent("channels")
      .appendingPathComponent(serverID)
      .appendingPathComponent(channelID)
  }

  static func copyToPasteboard(_ string: String) {
    #if os(iOS)
      UIPasteboard.general.string = string
    #elseif os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(string, forType: .string)
    #endif
  }
}
