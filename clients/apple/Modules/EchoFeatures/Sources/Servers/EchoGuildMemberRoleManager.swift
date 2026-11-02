import EchoDomain
import SwiftUI

/// Web-parity role assign panel: search, accent dots, Add / Added rows.
struct EchoGuildMemberRoleManager: View {
  let server: EchoServerSummary
  let member: EchoServerMember
  let model: EchoServersModel

  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @State private var searchText = ""
  @State private var pendingRoleIDs = Set<String>()

  private var preferLight: Bool { colorScheme == .light }

  private var everyoneRole: EchoServerRole? {
    model.roles(for: server.id).first(where: \.isEveryone)
  }

  private var manageableRoles: [EchoServerRole] {
    let assigned = Set(model.roleIDs(for: server.id, userID: member.userID))
    return model.roles(for: server.id)
      .filter { !$0.isEveryone }
      .filter { role in
        if assigned.contains(role.id) { return true }
        return model.canMutateRole(
          server: server, targetUserID: member.userID, roleID: role.id, assign: true)
      }
      .sorted { $0.position > $1.position }
  }

  private var filteredRoles: [EchoServerRole] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !query.isEmpty else { return manageableRoles }
    return manageableRoles.filter { $0.name.lowercased().contains(query) }
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 6) {
          Text(EchoCopy.string("Manage Roles"))
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .tracking(2.0)
            .textCase(.uppercase)
            .foregroundStyle(EchoTheme.Color.ink(0.45))
          Text(EchoCopy.format("Assign roles for %@", member.name))
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)

        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.40))
          TextField(EchoCopy.string("Search roles"), text: $searchText)
            .font(.system(size: 14, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .textFieldStyle(.plain)
            #if os(iOS)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
            #endif
        }
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(EchoTheme.Color.ink(0.06), in: Capsule())
        .padding(.horizontal, 18)
        .padding(.bottom, 12)

        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 8) {
            if let everyone = everyoneRole {
              roleRow(role: everyone, assigned: true, everyone: true, disabled: true)
            }

            ForEach(filteredRoles) { role in
              let assigned = model.roleIDs(for: server.id, userID: member.userID).contains(role.id)
              let canAssign = model.canMutateRole(
                server: server, targetUserID: member.userID, roleID: role.id, assign: true)
              let canRemove = model.canMutateRole(
                server: server, targetUserID: member.userID, roleID: role.id, assign: false)
              let blocked = assigned ? !canRemove : !canAssign
              let pending = pendingRoleIDs.contains(role.id)
              Button {
                guard !blocked, !pending, !model.isRoleMutationBusy else { return }
                let nextAssign = !assigned
                pendingRoleIDs.insert(role.id)
                Task {
                  await model.toggleRole(
                    server: server,
                    targetUserID: member.userID,
                    roleID: role.id,
                    assign: nextAssign
                  )
                  pendingRoleIDs.remove(role.id)
                }
              } label: {
                roleRow(
                  role: role,
                  assigned: assigned,
                  everyone: false,
                  disabled: blocked || pending || model.isRoleMutationBusy
                )
              }
              .buttonStyle(.plain)
              .disabled(blocked || pending || model.isRoleMutationBusy)
            }

            if filteredRoles.isEmpty {
              Text(emptyHint)
                .font(.system(size: 13, weight: .regular, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.48))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 16)
                .padding(.horizontal, 4)
            }
          }
          .padding(.horizontal, 14)
          .padding(.bottom, 28)
        }
      }
      .background(EchoHomeBackground().ignoresSafeArea())
      .navigationBarTitleDisplayModeCompat()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
      }
      .alert(
        EchoCopy.string("Couldn’t update member"),
        isPresented: Binding(
          get: { model.memberActionErrorMessage != nil },
          set: { if !$0 { model.clearMemberActionError() } }
        )
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { model.clearMemberActionError() }
      } message: {
        Text(model.memberActionErrorMessage ?? "")
      }
    }
  }

  private var emptyHint: String {
    if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return EchoCopy.string("No matching roles.")
    }
    if manageableRoles.isEmpty {
      return EchoCopy.string("No roles you can assign from here.")
    }
    return EchoCopy.string("No matching roles.")
  }

  private func roleRow(
    role: EchoServerRole,
    assigned: Bool,
    everyone: Bool,
    disabled: Bool
  ) -> some View {
    let label: String = {
      if everyone {
        return EchoCopy.string("Everyone")
      }
      return assigned ? EchoCopy.string("Added") : EchoCopy.string("Add")
    }()
    let title = everyone && role.name == "@everyone" ? EchoCopy.string("Member") : role.name

    return HStack(spacing: 12) {
      EchoRoleIconMark(
        role: role, preferLight: preferLight, size: 12, baseURL: model.client.baseURL,
        accessToken: model.auth.activeSession?.accessToken)
      Text(title)
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(
          disabled && !everyone ? EchoTheme.Color.ink(0.40) : EchoTheme.Color.ink(0.92)
        )
        .lineLimit(1)
      Spacer(minLength: 8)
      Text(label)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(
          assigned
            ? (Color(hex: role.displayColor(preferLight: preferLight))
              ?? EchoTheme.Color.ink(0.55))
            : EchoTheme.Color.ink(0.42)
        )
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .background(
      assigned && !everyone
        ? EchoTheme.Color.ink(0.07)
        : Color.clear,
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .opacity(everyone ? 0.9 : 1)
  }
}

#if os(iOS)
  extension View {
    fileprivate func navigationBarTitleDisplayModeCompat() -> some View {
      navigationBarTitleDisplayMode(.inline)
    }
  }
#else
  extension View {
    fileprivate func navigationBarTitleDisplayModeCompat() -> some View { self }
  }
#endif
