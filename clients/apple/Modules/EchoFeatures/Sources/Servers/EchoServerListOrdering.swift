import Foundation

/// Joined-server list order for the native Servers tab.
///
/// Base sequence is the API `/servers` membership order (same array web loads
/// into `serverStore.servers` before local rail tweaks). Starred pins float to
/// the top; MRU is optional and unused for the main Servers list so opens do
/// not reshuffle away from that real order.
enum EchoServerListOrdering {
  static let maxStarredServers = 4
  static let mruMaxStored = 64

  static func compare(
    aID: String,
    bID: String,
    pinnedIDs: [String],
    mruIDs: [String],
    baseIndexByID: [String: Int]
  ) -> Bool {
    let pr = rank(pinnedIDs, aID) - rank(pinnedIDs, bID)
    if pr != 0 { return pr < 0 }
    let mr = rank(mruIDs, aID) - rank(mruIDs, bID)
    if mr != 0 { return mr < 0 }
    return (baseIndexByID[aID] ?? 0) < (baseIndexByID[bID] ?? 0)
  }

  static func orderedIDs(
    serverIDs: [String],
    pinnedIDs: [String],
    mruIDs: [String] = []
  ) -> [String] {
    var baseIndexByID: [String: Int] = [:]
    for (idx, id) in serverIDs.enumerated() {
      baseIndexByID[id] = idx
    }
    return serverIDs.sorted {
      compare(
        aID: $0, bID: $1, pinnedIDs: pinnedIDs, mruIDs: mruIDs,
        baseIndexByID: baseIndexByID)
    }
  }

  static func touchMru(_ mruIDs: [String], serverID: String) -> [String] {
    let id = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return mruIDs }
    var next = [id]
    for existing in mruIDs where existing != id {
      next.append(existing)
      if next.count >= mruMaxStored { break }
    }
    return next
  }

  private static func rank(_ ids: [String], _ id: String) -> Int {
    ids.firstIndex(of: id) ?? 99_999
  }
}
