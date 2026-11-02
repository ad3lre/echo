import EchoDomain
import SwiftUI

/// Web `PermissionOverwriteEditor` — role / member overwrite rows with Discord-style tri-state bits.
/// Shared by channel settings and category settings.
struct EchoPermissionOverwriteEditor: View {
  @Binding var rows: [EchoPermissionOverwrite]
  let defs: [EchoPermissionDef]
  let roles: [EchoServerRole]
  let members: [EchoServerMember]
  var loading = false

  @State private var selectedKey = EchoPermissionOverwriteRows.everyoneKey
  @State private var showingAdd = false

  private var everyoneKey: String { EchoPermissionOverwriteRows.everyoneKey }

  /// Rows ordered @everyone → roles (server order) → members (A–Z). @everyone is always listed.
  private var orderedRows: [EchoPermissionOverwrite] {
    let everyone =
      rows.first { $0.targetType == everyoneKey }
      ?? EchoPermissionOverwrite(id: everyoneKey, targetType: everyoneKey)
    let roleRows = rows.filter { $0.targetType == "role" }.sorted {
      roleIndex($0) < roleIndex($1)
    }
    let memberRows = rows.filter { $0.targetType == "member" }.sorted {
      title(for: $0).localizedCaseInsensitiveCompare(title(for: $1)) == .orderedAscending
    }
    return [everyone] + roleRows + memberRows
  }

  private var selectedRow: EchoPermissionOverwrite? {
    orderedRows.first { EchoPermissionOverwriteRows.rowKey($0) == selectedKey }
  }

  var body: some View {
    if loading {
      Text(EchoCopy.string("Loading permissions…"))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .padding(.top, 8)
    } else {
      VStack(alignment: .leading, spacing: 16) {
        targetStrip
        if let row = selectedRow {
          selectedHeader(row)
          permissionGroups(for: row)
        }
      }
      .onChange(of: rows) { _, _ in
        if selectedRow == nil { selectedKey = everyoneKey }
      }
    }
  }

  // MARK: - Targets

  private var targetStrip: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(orderedRows) { row in
          targetChip(row)
        }
        Button {
          showingAdd = true
        } label: {
          Label(EchoCopy.string("Add role or member"), systemImage: "plus")
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.signInBlue)
            .padding(.horizontal, 12)
            .frame(height: 32)
            .overlay {
              Capsule().strokeBorder(EchoTheme.Color.signInBlue.opacity(0.5), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showingAdd, arrowEdge: .bottom) {
          EchoOverwriteTargetPicker(
            roles: availableRoles,
            members: availableMembers,
            onPickRole: { addRow(targetType: "role", targetID: $0) },
            onPickMember: { addRow(targetType: "member", targetID: $0) }
          )
        }
      }
    }
  }

  private func targetChip(_ row: EchoPermissionOverwrite) -> some View {
    let key = EchoPermissionOverwriteRows.rowKey(row)
    let selected = key == selectedKey
    let count = explicitCount(row)
    return Button {
      selectedKey = key
    } label: {
      HStack(spacing: 6) {
        if row.targetType == "role", let dot = Color(hex: role(for: row)?.color) {
          Circle().fill(dot).frame(width: 9, height: 9)
        }
        Text(title(for: row))
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
        if count > 0 {
          Text("\(count)")
            .font(.system(size: 10.5, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(EchoTheme.Color.ink(0.12), in: Capsule())
        }
      }
      .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.62))
      .padding(.horizontal, 12)
      .frame(height: 32)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.2) : EchoTheme.Color.ink(0.05),
        in: Capsule())
    }
    .buttonStyle(.plain)
  }

  private func selectedHeader(_ row: EchoPermissionOverwrite) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title(for: row))
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(subtitle(for: row))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
      Spacer(minLength: 8)
      if explicitCount(row) > 0 {
        EchoSettingsSecondaryButton(title: EchoCopy.string("Clear all")) {
          updatePartial(for: row) { $0 = [:] }
        }
      }
      if row.targetType != everyoneKey {
        EchoSettingsDangerButton(title: EchoCopy.string("Remove")) {
          rows.removeAll { EchoPermissionOverwriteRows.rowKey($0) == selectedKey }
          selectedKey = everyoneKey
        }
      }
    }
  }

  // MARK: - Permission list

  private func permissionGroups(for row: EchoPermissionOverwrite) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      ForEach(EchoChannelPermissionCatalog.grouped(defs), id: \.group.id) { section in
        VStack(alignment: .leading, spacing: 4) {
          Text(section.group.title.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.6)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .padding(.bottom, 2)
          ForEach(section.defs) { def in
            HStack(spacing: 12) {
              Text(def.label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(EchoTheme.Color.fg)
              Spacer(minLength: 8)
              EchoTriStateControl(
                value: row.partial[def.key],
                label: def.label
              ) { next in
                updatePartial(for: row) { partial in
                  if let next { partial[def.key] = next } else { partial[def.key] = nil }
                }
              }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
              EchoTheme.Color.ink(0.035),
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          }
        }
      }
    }
  }

  // MARK: - Mutations

  private func updatePartial(
    for row: EchoPermissionOverwrite, _ mutate: (inout [String: Bool]) -> Void
  ) {
    let key = EchoPermissionOverwriteRows.rowKey(row)
    if let index = rows.firstIndex(where: { EchoPermissionOverwriteRows.rowKey($0) == key }) {
      mutate(&rows[index].partial)
    } else if row.targetType == everyoneKey {
      var next = row
      mutate(&next.partial)
      rows.append(next)
    }
  }

  private func addRow(targetType: String, targetID: String) {
    let next = EchoPermissionOverwrite(
      id: UUID().uuidString, targetType: targetType, targetID: targetID)
    let key = EchoPermissionOverwriteRows.rowKey(next)
    if !rows.contains(where: { EchoPermissionOverwriteRows.rowKey($0) == key }) {
      rows.append(next)
    }
    selectedKey = key
    showingAdd = false
  }

  // MARK: - Lookups

  private var availableRoles: [EchoServerRole] {
    let used = Set(rows.filter { $0.targetType == "role" }.compactMap(\.targetID))
    return roles.filter { !$0.isEveryone && !used.contains($0.id) }
  }

  private var availableMembers: [EchoServerMember] {
    let used = Set(rows.filter { $0.targetType == "member" }.compactMap(\.targetID))
    return members.filter { !used.contains($0.userID) }
  }

  private func role(for row: EchoPermissionOverwrite) -> EchoServerRole? {
    roles.first { $0.id == row.targetID }
  }

  private func roleIndex(_ row: EchoPermissionOverwrite) -> Int {
    roles.firstIndex { $0.id == row.targetID } ?? Int.max
  }

  private func title(for row: EchoPermissionOverwrite) -> String {
    switch row.targetType {
    case everyoneKey: return "@everyone"
    case "role": return role(for: row)?.name ?? EchoCopy.string("Unknown role")
    default:
      return members.first { EchoUserIdentity.matches($0.userID, row.targetID ?? "") }?.name
        ?? EchoCopy.string("Unknown member")
    }
  }

  private func subtitle(for row: EchoPermissionOverwrite) -> String {
    switch row.targetType {
    case everyoneKey: EchoCopy.string("Applies to every member unless a role or member overrides it.")
    case "role": EchoCopy.string("Role overwrite")
    default: EchoCopy.string("Member overwrite")
    }
  }

  private func explicitCount(_ row: EchoPermissionOverwrite) -> Int {
    let keys = Set(defs.map(\.key))
    return row.partial.keys.filter { keys.contains($0) }.count
  }
}

/// Deny / inherit / allow control for one permission bit.
struct EchoTriStateControl: View {
  let value: Bool?
  let label: String
  var onChange: (Bool?) -> Void

  var body: some View {
    HStack(spacing: 2) {
      segment(symbol: "xmark", target: false, tint: EchoTheme.Color.mentionPing)
      segment(symbol: "slash.circle", target: nil, tint: EchoTheme.Color.ink(0.6))
      segment(symbol: "checkmark", target: true, tint: EchoTheme.Color.presenceOnline)
    }
    .padding(2)
    .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
  }

  private func segment(symbol: String, target: Bool?, tint: Color) -> some View {
    let active = value == target
    return Button {
      onChange(target)
    } label: {
      Image(systemName: symbol)
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(active ? Color.white : EchoTheme.Color.ink(0.42))
        .frame(width: 30, height: 26)
        .background(
          active ? tint : Color.clear,
          in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Self.stateLabel(target))
    .accessibilityAddTraits(active ? .isSelected : [])
  }

  static func stateLabel(_ target: Bool?) -> String {
    switch target {
    case true: EchoCopy.string("Allow")
    case false: EchoCopy.string("Deny")
    default: EchoCopy.string("Inherit")
    }
  }
}

/// Searchable role / member picker shown from the "Add role or member" popover.
struct EchoOverwriteTargetPicker: View {
  let roles: [EchoServerRole]
  let members: [EchoServerMember]
  var onPickRole: (String) -> Void
  var onPickMember: (String) -> Void

  @State private var tab = Tab.roles
  @State private var query = ""

  private enum Tab: Hashable { case roles, members }

  private var filteredRoles: [EchoServerRole] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return needle.isEmpty ? roles : roles.filter { $0.name.lowercased().contains(needle) }
  }

  private var filteredMembers: [EchoServerMember] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let base =
      needle.isEmpty
      ? members
      : members.filter {
        $0.name.lowercased().contains(needle) || ($0.username ?? "").lowercased().contains(needle)
      }
    return Array(base.prefix(60))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Picker("", selection: $tab) {
        Text(EchoCopy.string("Roles")).tag(Tab.roles)
        Text(EchoCopy.string("Members")).tag(Tab.members)
      }
      .labelsHidden()
      .pickerStyle(.segmented)
      TextField(
        tab == .roles
          ? EchoCopy.string("Search roles") : EchoCopy.string("Search members"),
        text: $query
      )
      .textFieldStyle(.plain)
      .font(.system(size: 13))
      .padding(.horizontal, 10)
      .frame(height: 32)
      .background(
        EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 2) {
          if tab == .roles {
            ForEach(filteredRoles) { role in
              pickerRow(title: role.name, tint: Color(hex: role.color)) { onPickRole(role.id) }
            }
            if filteredRoles.isEmpty { emptyLabel }
          } else {
            ForEach(filteredMembers) { member in
              pickerRow(title: member.name, subtitle: member.username, seed: member.userID) {
                onPickMember(member.userID)
              }
            }
            if filteredMembers.isEmpty { emptyLabel }
          }
        }
      }
      .frame(maxHeight: 280)
    }
    .padding(14)
    .frame(width: 300)
  }

  private var emptyLabel: some View {
    Text(EchoCopy.string("Nothing to add."))
      .font(.system(size: 12))
      .foregroundStyle(EchoTheme.Color.ink(0.46))
      .padding(8)
  }

  private func pickerRow(
    title: String, subtitle: String? = nil, tint: Color? = nil, seed: String? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let seed {
          EchoGeneratedAvatar(name: title, seed: seed).frame(width: 22, height: 22)
            .clipShape(Circle())
        } else if let tint {
          Circle().fill(tint).frame(width: 10, height: 10)
        }
        Text(title).font(.system(size: 13, weight: .medium)).lineLimit(1)
        if let subtitle, !subtitle.isEmpty {
          Text("@\(subtitle)")
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
