import Foundation

/// One self-selectable role in the member panel (`SelfRolesPanelRole` in `contracts/types/selfAssignableRoles.ts`).
public struct EchoSelfRolesRole: Identifiable, Equatable, Sendable, Decodable {
  public let id: String
  public let name: String
  public let color: String
  public let darkColor: String
  public let lightColor: String
  public let separateThemeColors: Bool

  public func displayColor(preferLight: Bool) -> String {
    guard separateThemeColors else { return color }
    return preferLight ? lightColor : darkColor
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    name = try values.decodeIfPresent(String.self, forKey: .name) ?? ""
    let base = try values.decodeIfPresent(String.self, forKey: .color) ?? "#99aab5"
    color = base.isEmpty ? "#99aab5" : base
    darkColor = try values.decodeIfPresent(String.self, forKey: .darkColor) ?? color
    lightColor = try values.decodeIfPresent(String.self, forKey: .lightColor) ?? color
    separateThemeColors = try values.decodeIfPresent(Bool.self, forKey: .separateThemeColors) ?? false
  }

  enum CodingKeys: String, CodingKey {
    case id, name, color, darkColor, lightColor, separateThemeColors
  }
}

public struct EchoSelfRolesCategory: Identifiable, Equatable, Sendable, Decodable {
  public let id: String
  public let name: String
  /// `derived` categories sync from role-settings categories; `custom` are admin-defined.
  public let isDerived: Bool
  public let roles: [EchoSelfRolesRole]

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    name = try values.decodeIfPresent(String.self, forKey: .name) ?? ""
    isDerived = (try values.decodeIfPresent(String.self, forKey: .source)) == "derived"
    roles = try values.decodeIfPresent([EchoSelfRolesRole].self, forKey: .roles) ?? []
  }

  enum CodingKeys: String, CodingKey {
    case id, name, source, roles
  }
}

/// `GET /servers/:id/self-roles-panel` / `POST …/self-roles/toggle` body.
public struct EchoSelfRolesPanel: Equatable, Sendable, Decodable {
  public let categories: [EchoSelfRolesCategory]
  public let assignedRoleIDs: Set<String>

  public var totalRoleCount: Int { categories.reduce(0) { $0 + $1.roles.count } }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    categories = try values.decodeIfPresent([EchoSelfRolesCategory].self, forKey: .categories) ?? []
    assignedRoleIDs = Set(
      try values.decodeIfPresent([String].self, forKey: .assignedRoleIDs) ?? [])
  }

  enum CodingKeys: String, CodingKey {
    case categories
    case assignedRoleIDs = "assignedRoleIds"
  }
}
