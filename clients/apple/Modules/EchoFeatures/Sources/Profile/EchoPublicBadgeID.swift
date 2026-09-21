import Foundation

/// Stable public badge ids from the Echo API / `contracts/echoAccountBadges.ts`.
enum EchoPublicBadgeID: String, CaseIterable, Sendable, Hashable, Identifiable {
  case plus
  case black
  case og
  case bugHunter = "bug_hunter"
  case developer

  var id: String { rawValue }

  /// Short label inside the pill (matches web `echoPublicBadgeLabel`).
  var label: String {
    switch self {
    case .plus: "Plus"
    case .black: "Black"
    case .og: "OG"
    case .bugHunter: EchoCopy.string("Bug Hunter")
    case .developer: EchoCopy.string("Developer")
    }
  }

  /// Accessibility / tooltip title (matches web `echoPublicBadgeTitle`).
  var title: String {
    switch self {
    case .plus: EchoCopy.string("Echo+ subscriber")
    case .black: EchoCopy.string("Echo Black subscriber")
    case .og: EchoCopy.string("Original Echo member — among the first 100 accounts")
    case .bugHunter: EchoCopy.string("Bug Hunter — helped find and report bugs")
    case .developer: EchoCopy.string("Echo developer — builds and maintains Echo")
    }
  }

  /// Paid tier first, then OG, then awarded — same order as web.
  static let displayOrder: [EchoPublicBadgeID] = [
    .plus, .black, .og, .bugHunter, .developer,
  ]

  static func parse(_ raw: String) -> EchoPublicBadgeID? {
    EchoPublicBadgeID(rawValue: raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
  }

  /// Filters unknown ids and de-dupes while preserving first-seen order.
  static func normalize(_ raw: [String]?) -> [EchoPublicBadgeID] {
    guard let raw, !raw.isEmpty else { return [] }
    var seen = Set<EchoPublicBadgeID>()
    var out: [EchoPublicBadgeID] = []
    for value in raw {
      guard let id = parse(value), seen.insert(id).inserted else { continue }
      out.append(id)
    }
    return out.sorted { lhs, rhs in
      let li = displayOrder.firstIndex(of: lhs) ?? displayOrder.count
      let ri = displayOrder.firstIndex(of: rhs) ?? displayOrder.count
      return li < ri
    }
  }
}
