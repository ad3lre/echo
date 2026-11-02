import Foundation

/// Gate for reloading the mention inbox while Notifications stays open.
enum EchoNotificationsLiveSync {
  /// Reload only when the attention mention ping count increases after an initial sample.
  static func shouldReload(previous: Int?, next: Int) -> Bool {
    guard let previous else { return false }
    return next > previous
  }
}
