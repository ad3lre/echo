import EchoDomain
import SwiftUI

/// Web `ServerSettingsRolesSection` — create / edit / delete / permission matrix.
struct EchoServerSettingsRolesEditor: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var baseURL = URL(string: "https://echo.invalid")!
  var accessToken: String? = nil
  @Binding var localError: String?
  /// Closes Server Settings after starting a live role preview (web `previewSelectedRole`).
  var onCloseSettings: (() -> Void)? = nil

  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var selectedRoleID: String?
  @State private var draftName = ""
  @State private var draftColor = "#94a3b8"
  @State private var draftHoist = false
  @State private var draftIcon = EchoRoleIconPatch.clear
  @State private var enabledPermissions: Set<EchoServerSettingsPermission> = []
  @State private var showingDelete = false
  @State private var creating = false

  private var preferLight: Bool { colorScheme == .light }
  private var roles: [EchoServerRole] {
    model.roles(for: server.id)
      .filter { !$0.isEveryone }
      .sorted {
        if $0.position != $1.position { return $0.position > $1.position }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
  }

  private var selected: EchoServerRole? {
    guard let selectedRoleID else { return roles.first }
    return roles.first { $0.id == selectedRoleID } ?? roles.first
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      HStack(alignment: .top, spacing: 16) {
        roleList
          .frame(width: 220)
        if let selected {
          roleEditor(selected)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          Text(EchoCopy.string("No roles yet. Create one to get started."))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
        }
      }
      EchoRolePermissionPreview(server: server, model: model, initialRoleID: selected?.id)
    }
    .onAppear { syncSelection(prefer: selectedRoleID) }
    .onChange(of: model.roleEpoch) { _, _ in syncSelection(prefer: selectedRoleID) }
    .alert(EchoCopy.string("Delete role?"), isPresented: $showingDelete) {
      Button(EchoCopy.string("Delete"), role: .destructive) {
        guard let id = selected?.id else { return }
        Task {
          if await model.deleteRole(server, roleID: id) {
            selectedRoleID = nil
            syncSelection(prefer: nil)
          } else {
            localError = model.actionErrorMessage
          }
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        EchoCopy.format(
          "Delete %@? Members keep other roles.", selected?.name ?? EchoCopy.string("role")))
    }
  }

  private var roleList: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(EchoCopy.string("Roles"))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        Spacer()
        Button {
          Task { await createRole() }
        } label: {
          Image(systemName: "plus")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
            .frame(width: 28, height: 28)
            .background(
              EchoTheme.Color.ink(0.08),
              in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(creating)
        .accessibilityLabel(EchoCopy.string("Create role"))
      }

      VStack(spacing: 4) {
        ForEach(roles) { role in
          let selected = role.id == (selectedRoleID ?? self.selected?.id)
          Button {
            selectedRoleID = role.id
            loadDraft(from: role)
          } label: {
            HStack(spacing: 8) {
              EchoRoleIconMark(
                role: role, preferLight: preferLight, size: 12, baseURL: baseURL,
                accessToken: accessToken)
              Text(role.name)
                .font(.system(size: 13, weight: selected ? .semibold : .medium))
                .foregroundStyle(EchoTheme.Color.fg)
                .lineLimit(1)
              Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
              selected
                ? EchoTheme.Color.signInBlue.opacity(0.16) : EchoTheme.Color.ink(0.035),
              in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func roleEditor(_ role: EchoServerRole) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      EchoDesktopLabeledField(title: EchoCopy.string("Name")) {
        TextField(EchoCopy.string("Role name"), text: $draftName)
      }
      EchoDesktopLabeledField(title: EchoCopy.string("Color")) {
        TextField(EchoCopy.string("#94a3b8"), text: $draftColor)
          #if os(iOS)
            .textInputAutocapitalization(.never)
          #endif
      }
      EchoRoleIconPicker(
        server: server, model: model, baseURL: baseURL, accessToken: accessToken,
        icon: draftIcon,
        accent: Color(hex: draftColor) ?? EchoTheme.Color.ink(0.35)
      ) { patch, persistNow in
        draftIcon = patch
        if persistNow { Task { await persistIcon(role) } }
      }
      Toggle(isOn: $draftHoist) {
        VStack(alignment: .leading, spacing: 2) {
          Text(EchoCopy.string("Display role members separately"))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.string("Hoist this role in the member list."))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
      }
      .toggleStyle(.switch)

      Text(EchoCopy.string("Permissions"))
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.5))

      ForEach(EchoServerSettingsPermission.grouped, id: \.group) { group in
        VStack(alignment: .leading, spacing: 6) {
          Text(group.group.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.4)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          ForEach(group.items) { permission in
            Toggle(isOn: binding(for: permission)) {
              Text(permission.label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(EchoTheme.Color.fg)
            }
            .toggleStyle(.switch)
            .controlSize(.small)
          }
        }
        .padding(12)
        .background(
          EchoTheme.Color.ink(0.035),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
      }

      HStack {
        Button(EchoCopy.string("Delete role"), role: .destructive) {
          showingDelete = true
        }
        .buttonStyle(.plain)
        .foregroundStyle(EchoTheme.Color.mentionPing)
        Spacer()
        EchoDesktopGhostButton(title: EchoCopy.string("Preview as role")) {
          startLivePreview(role)
        }
        EchoDesktopPrimaryButton(title: EchoCopy.string("Save Changes")) {
          Task { await save(role) }
        }
      }
    }
  }

  private func startLivePreview(_ role: EchoServerRole) {
    let name = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
    let color = draftColor.trimmingCharacters(in: .whitespacesAndNewlines)
    shellChrome.startRolePreview(
      EchoRolePreviewState(
        serverID: server.id,
        roleID: role.id,
        roleName: name.isEmpty ? role.name : name,
        roleColor: color.isEmpty ? role.color : (color.hasPrefix("#") ? color : "#\(color)"),
        uiPermissions: EchoRolePreviewPermissions.uiPermissions(
          enabled: enabledPermissions, storedEcho: role.permissions)))
    onCloseSettings?()
  }

  private func binding(for permission: EchoServerSettingsPermission) -> Binding<Bool> {
    Binding(
      get: { enabledPermissions.contains(permission) },
      set: { on in
        if on {
          enabledPermissions.insert(permission)
        } else {
          enabledPermissions.remove(permission)
          if permission == .administrator {
            // Keep explicit toggles as-is when turning admin off.
          }
        }
      }
    )
  }

  private func syncSelection(prefer: String?) {
    let next = prefer.flatMap { id in roles.first { $0.id == id } } ?? roles.first
    selectedRoleID = next?.id
    if let next { loadDraft(from: next) }
  }

  private func loadDraft(from role: EchoServerRole) {
    draftName = role.name
    draftColor = role.color
    draftHoist = role.hoist
    draftIcon = Self.icon(of: role)
    let stored = Set(role.permissions)
    enabledPermissions = Set(
      EchoServerSettingsPermission.allCases.filter {
        EchoServerSettingsPermission.isEnabled($0, in: stored)
      }
    )
  }

  private func createRole() async {
    creating = true
    defer { creating = false }
    localError = nil
    if let id = await model.createRole(server, name: EchoCopy.string("new role")) {
      selectedRoleID = id
      syncSelection(prefer: id)
    } else {
      localError = model.actionErrorMessage
    }
  }

  private func save(_ role: EchoServerRole) async {
    localError = nil
    let trimmed = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      localError = EchoCopy.string("Enter a role name.")
      return
    }
    var color = draftColor.trimmingCharacters(in: .whitespacesAndNewlines)
    if !color.hasPrefix("#") { color = "#\(color)" }
    let permissions = EchoServerSettingsPermission.merge(
      uiEnabled: enabledPermissions, preserving: role.permissions)
    if await model.updateRole(
      server,
      roleID: role.id,
      name: trimmed,
      color: color,
      permissions: permissions,
      hoist: draftHoist,
      roleIcon: draftIcon == Self.icon(of: role) ? nil : draftIcon
    ) {
      selectedRoleID = role.id
      syncSelection(prefer: role.id)
    } else {
      localError = model.actionErrorMessage
    }
  }

  private static func icon(of role: EchoServerRole) -> EchoRoleIconPatch {
    EchoRoleIconPatch(url: role.roleIconURL, emojiID: role.roleIconEmojiID)
  }

  /// Web `uploadSelectedRoleIcon`: uploads are persisted right away, not left in the dirty bar.
  private func persistIcon(_ role: EchoServerRole) async {
    localError = nil
    if await model.updateRole(server, roleID: role.id, roleIcon: draftIcon) {
      syncSelection(prefer: role.id)
    } else {
      localError = model.actionErrorMessage
    }
  }
}
