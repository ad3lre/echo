import EchoDomain
import EchoNetworking
import Foundation

extension Notification.Name {
  /// Posted after a group DM is created / renamed / changed / left.
  /// `userInfo`: `channelID` (String), `left` (Bool).
  static let echoGroupDmChanged = Notification.Name("EchoGroupDmChanged")
}

/// Create / manage rules shared by the group-DM sheets (web `GroupDMCreateModal` + `dm/group/*`).
enum EchoGroupDmRules {
  /// A group needs at least 3 people including you.
  static let minPeople = 3
  /// Friend picks only — server `POST /dm/group/open` caps total `memberUserIds` (including you) at 32.
  static let maxPicks = 31
  static let maxNameLength = 48

  /// Web `clampEchoChannelName`.
  static func clampName(_ raw: String) -> String {
    String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxNameLength))
  }

  /// Web default: "Group with {name}" for one pick, "Group with {n} people" otherwise.
  static func defaultName(for picked: [EchoUserProfile]) -> String {
    if picked.count == 1 { return EchoCopy.format("Group with %@", picked[0].name) }
    return EchoCopy.format("Group with %lld people", Int64(picked.count))
  }

  /// Web `b34.groupOverview.memberCountOne` / `memberCountMany`.
  static func memberCountLabel(for totalIncludingSelf: Int) -> String {
    if totalIncludingSelf == 1 {
      return EchoCopy.string("1 member")
    }
    return EchoCopy.format("%lld members", Int64(totalIncludingSelf))
  }

  /// Auto subtitle when the group has no custom description (web `groupDescription`).
  static func overviewDescription(memberNames: [String]) -> String {
    let names = memberNames.map {
      $0.trimmingCharacters(in: .whitespacesAndNewlines)
    }.filter { !$0.isEmpty }
    switch names.count {
    case 0:
      return EchoCopy.string("Private group DM")
    case 1:
      return EchoCopy.format("Group with %@", names[0])
    case 2:
      return EchoCopy.format("Group with %@ and %@", names[0], names[1])
    default:
      return EchoCopy.format(
        "Group with %@, %@, and %lld others",
        names[0], names[1], Int64(names.count - 2))
    }
  }

  /// Localized validation message for the create flow, `nil` when the pick is submittable.
  static func createError(pickCount: Int) -> String? {
    if pickCount + 1 < minPeople {
      return EchoCopy.string(
        "A group DM needs at least 3 people including you — pick at least two friends.")
    }
    return nil
  }

  /// Payload for `POST /dm/group/open` — initiator must be included (web `openEchoGroupDmOnServer`).
  static func memberUserIDs(picked: [String], including selfID: String) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for raw in [selfID] + picked {
      let id = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, seen.insert(id).inserted else { continue }
      out.append(id)
    }
    return out
  }

  static func notifyChanged(channelID: String, left: Bool = false) {
    NotificationCenter.default.post(
      name: .echoGroupDmChanged, object: nil,
      userInfo: ["channelID": channelID, "left": left])
  }
}
