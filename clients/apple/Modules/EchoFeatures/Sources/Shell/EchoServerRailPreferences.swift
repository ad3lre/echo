import Foundation
import Observation

/// Desktop server-rail preferences — mirrors web `serverRailUiPreferences`.
@MainActor
@Observable
final class EchoServerRailPreferences {
  static let shared = EchoServerRailPreferences()

  enum Keys {
    static let serversAlwaysOn = "echo.serverRail.serversAlwaysOn"
    static let extendedServerList = "echo.serverRail.extendedServerList"
  }

  /// Default visible guild icons on the rail (web `VISIBLE_SERVER_RAIL_SLOT_COUNT`).
  static let defaultSlotCount = 5
  /// Extended capacity (web `EXTENDED_VISIBLE_SERVER_RAIL_SLOT_COUNT`).
  static let extendedSlotCount = 10

  /// Keep guild icons on the rail even when Chat / Explore is selected.
  var serversAlwaysOn: Bool {
    didSet { UserDefaults.standard.set(serversAlwaysOn, forKey: Keys.serversAlwaysOn) }
  }

  /// Show up to 10 guild icons instead of 5.
  var extendedServerList: Bool {
    didSet { UserDefaults.standard.set(extendedServerList, forKey: Keys.extendedServerList) }
  }

  var visibleSlotCount: Int {
    extendedServerList ? Self.extendedSlotCount : Self.defaultSlotCount
  }

  private init() {
    let defaults = UserDefaults.standard
    serversAlwaysOn = defaults.object(forKey: Keys.serversAlwaysOn) as? Bool ?? false
    extendedServerList = defaults.object(forKey: Keys.extendedServerList) as? Bool ?? false
  }
}
