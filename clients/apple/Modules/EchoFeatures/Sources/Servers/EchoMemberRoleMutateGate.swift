import EchoDomain
import Foundation

/// Mirrors web `canMutateEchoMemberRole` so Manage Roles only offers API-accepted toggles.
enum EchoMemberRoleMutateGate {
  static func canMutate(
    assign: Bool,
    actorUserID: String,
    targetUserID: String,
    roleID: String,
    actorIsServerOwner: Bool,
    targetIsServerOwner: Bool,
    catalog: [EchoServerRole],
    assignments: [String: [String]]
  ) -> Bool {
    guard let role = catalog.first(where: { $0.id == roleID }) else { return false }
    if role.isEveryone { return false }
    if !actorIsServerOwner && targetIsServerOwner { return false }
    if actorIsServerOwner { return true }

    let kindManage = !assign
    let actorRoleIDs = assignments[actorUserID] ?? []
    let targetRoleIDs = assignments[targetUserID] ?? []
    let targetCategoryID = role.roleCategoryID

    let globalGrant = actorHasGlobalGrant(actorRoleIDs, catalog: catalog, manage: kindManage)
    let categoryGrant =
      targetCategoryID != nil
      && actorHasCategoryGrant(
        actorRoleIDs, catalog: catalog, categoryID: targetCategoryID, manage: kindManage)

    if !globalGrant && !categoryGrant { return false }

    if globalGrant {
      let actorTop = topRolePositionGlobal(actorRoleIDs, catalog: catalog)
      if !(actorTop > role.position) { return false }
      if actorUserID != targetUserID {
        let targetTop = topRolePositionGlobal(targetRoleIDs, catalog: catalog)
        if !(actorTop > targetTop) { return false }
      }
    } else {
      let actorTop = topRankInCategory(
        actorRoleIDs, catalog: catalog, categoryID: targetCategoryID)
      if !(actorTop > role.rankInCategory) { return false }
      if actorUserID != targetUserID {
        let targetTop = topRankInCategory(
          targetRoleIDs, catalog: catalog, categoryID: targetCategoryID)
        if !(actorTop > targetTop) { return false }
      }
    }

    if actorUserID != targetUserID { return true }

    if assign {
      let union = unionPermissions(actorRoleIDs, catalog: catalog)
      return actorMayGrant(union: union, role: role)
    }
    return true
  }

  private static func roleHasManage(_ perms: [String]) -> Bool {
    perms.contains("MANAGE_ROLES") || perms.contains("ADMINISTRATOR")
  }

  private static func roleHasAssign(_ perms: [String]) -> Bool {
    perms.contains("ASSIGN_ROLES") || perms.contains("MANAGE_ROLES")
      || perms.contains("ADMINISTRATOR")
  }

  private static func isGlobalScope(_ scope: String) -> Bool {
    scope.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "category"
  }

  private static func actorHasGlobalGrant(
    _ actorRoleIDs: [String], catalog: [EchoServerRole], manage: Bool
  ) -> Bool {
    let byID = Self.roleIndex(catalog)
    for rid in actorRoleIDs {
      guard let role = byID[rid], !role.isEveryone, isGlobalScope(role.roleScope) else {
        continue
      }
      if manage ? roleHasManage(role.permissions) : roleHasAssign(role.permissions) {
        return true
      }
    }
    return false
  }

  private static func actorHasCategoryGrant(
    _ actorRoleIDs: [String], catalog: [EchoServerRole], categoryID: String?, manage: Bool
  ) -> Bool {
    let byID = Self.roleIndex(catalog)
    for rid in actorRoleIDs {
      guard let role = byID[rid], !role.isEveryone else { continue }
      if (role.roleCategoryID ?? "") != (categoryID ?? "") { continue }
      if manage ? roleHasManage(role.permissions) : roleHasAssign(role.permissions) {
        return true
      }
    }
    return false
  }

  private static func topRolePositionGlobal(
    _ userRoleIDs: [String], catalog: [EchoServerRole]
  ) -> Int {
    let byID = Self.roleIndex(catalog)
    var max = -1
    for rid in userRoleIDs {
      guard let role = byID[rid], !role.isEveryone else { continue }
      if role.position > max { max = role.position }
    }
    return max
  }

  private static func topRankInCategory(
    _ userRoleIDs: [String], catalog: [EchoServerRole], categoryID: String?
  ) -> Int {
    let byID = Self.roleIndex(catalog)
    var max = -1
    for rid in userRoleIDs {
      guard let role = byID[rid], !role.isEveryone else { continue }
      if (role.roleCategoryID ?? "") != (categoryID ?? "") { continue }
      if role.rankInCategory > max { max = role.rankInCategory }
    }
    return max
  }

  private static func unionPermissions(
    _ userRoleIDs: [String], catalog: [EchoServerRole]
  ) -> Set<String> {
    let byID = Self.roleIndex(catalog)
    var out = Set<String>()
    for rid in userRoleIDs {
      guard let role = byID[rid] else { continue }
      out.formUnion(role.permissions)
    }
    return out
  }

  /// Duplicate role ids must not fatal — bootstrap quirks used to crash assign.
  private static func roleIndex(_ catalog: [EchoServerRole]) -> [String: EchoServerRole] {
    var byID: [String: EchoServerRole] = [:]
    byID.reserveCapacity(catalog.count)
    for role in catalog {
      if byID[role.id] == nil { byID[role.id] = role }
    }
    return byID
  }

  private static func actorMayGrant(union: Set<String>, role: EchoServerRole) -> Bool {
    if union.contains("ADMINISTRATOR") { return true }
    for permission in role.permissions where !union.contains(permission) {
      return false
    }
    return true
  }
}

/// Section key for member list grouping (web `pickEchoMemberListSectionRole`).
struct EchoMemberListSection: Identifiable, Equatable {
  let id: String
  let title: String
  let colorHex: String
  let sortKey: Int
  let isUnhoisted: Bool
  let members: [EchoServerMember]

  static let unhoistedID = "__echo_unhoisted__"

  static func pickSectionRole(
    assignedRoleIDs: [String],
    catalog: [EchoServerRole],
    preferLight: Bool
  ) -> (id: String, title: String, colorHex: String, sortKey: Int, isUnhoisted: Bool) {
    let metas = catalog.filter { assignedRoleIDs.contains($0.id) }
    let hoisted = metas.filter(\.hoist)
    guard let top = hoisted.max(by: { $0.position < $1.position }) else {
      return (unhoistedID, "Members", "#94a3b8", -1, true)
    }
    let title = top.name == "@everyone" ? "Member" : top.name
    return (top.id, title, top.displayColor(preferLight: preferLight), top.position, false)
  }

  static func buildSections(
    members: [EchoServerMember],
    catalog: [EchoServerRole],
    assignments: [String: [String]],
    preferLight: Bool,
    hideGuests: Bool
  ) -> [EchoMemberListSection] {
    var buckets: [String: (
      title: String, color: String, sortKey: Int, isUnhoisted: Bool, members: [EchoServerMember]
    )] = [:]
    for member in members {
      if hideGuests && member.isGuest { continue }
      let picked = pickSectionRole(
        assignedRoleIDs: assignments[member.userID] ?? [],
        catalog: catalog,
        preferLight: preferLight
      )
      var bucket = buckets[picked.id] ?? (
        title: picked.title, color: picked.colorHex, sortKey: picked.sortKey,
        isUnhoisted: picked.isUnhoisted, members: []
      )
      bucket.members.append(member)
      buckets[picked.id] = bucket
    }
    return buckets.map { id, bucket in
      let sorted = bucket.members.sorted {
        $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
      return EchoMemberListSection(
        id: id,
        title: bucket.title,
        colorHex: bucket.color,
        sortKey: bucket.sortKey,
        isUnhoisted: bucket.isUnhoisted,
        members: sorted
      )
    }
    .sorted { a, b in
      if a.isUnhoisted != b.isUnhoisted { return !a.isUnhoisted && b.isUnhoisted }
      if a.sortKey != b.sortKey { return a.sortKey > b.sortKey }
      return a.title.localizedCaseInsensitiveCompare(b.title) == .orderedAscending
    }
  }
}
