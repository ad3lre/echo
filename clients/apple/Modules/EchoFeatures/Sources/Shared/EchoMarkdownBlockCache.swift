import Foundation

/// Process-wide parse cache so LazyVStack row rebuilds do not re-run the
/// Markdown pipeline for unchanged message bodies.
enum EchoMarkdownBlockCache {
  private final class State: @unchecked Sendable {
    let lock = NSLock()
    var values: [String: [EchoMarkdownBlock]] = [:]
    var order: [String] = []
  }

  private static let state = State()
  private static let maximumEntries = 384

  static func blocks(_ source: String) -> [EchoMarkdownBlock] {
    let state = Self.state
    state.lock.lock()
    if let hit = state.values[source] {
      if let index = state.order.firstIndex(of: source) {
        state.order.remove(at: index)
        state.order.append(source)
      }
      state.lock.unlock()
      return hit
    }
    state.lock.unlock()

    let parsed = EchoMarkdownParser.blocks(source)

    state.lock.lock()
    state.values[source] = parsed
    state.order.removeAll { $0 == source }
    state.order.append(source)
    while state.order.count > maximumEntries, let expired = state.order.first {
      state.order.removeFirst()
      state.values.removeValue(forKey: expired)
    }
    state.lock.unlock()
    return parsed
  }

  static func clear() {
    let state = Self.state
    state.lock.lock()
    state.values.removeAll()
    state.order.removeAll()
    state.lock.unlock()
  }
}
