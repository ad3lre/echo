import EchoDomain
import SwiftUI

/// Server-scoped member popout: roles, manage roles, kick / ban / timeout.
struct EchoGuildMemberQuickProfile: View {
  let server: EchoServerSummary
  let member: EchoServerMember
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  var onOpenFullProfile: (() -> Void)? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @State private var showingManageRoles = false
  @State private var confirmKick = false
  @State private var confirmBan = false
  @State private var confirmTimeout = false

  private var preferLight: Bool { colorScheme == .light }
  private var roles: [EchoServerRole] {
    model.displayedRoles(for: server.id, userID: member.userID, preferLight: preferLight)
  }

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          header

          if let joined = formattedJoinedAt {
            labeledRow(
              title: EchoCopy.string("Member since"),
              value: joined
            )
          }

          if isTimedOut {
            labeledRow(
              title: EchoCopy.string("Timeout"),
              value: EchoCopy.string("Communication disabled")
            )
          }

          rolesSection

          moderationSection

          Button {
            onOpenFullProfile?()
          } label: {
            Text(EchoCopy.string("View full profile"))
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .frame(maxWidth: .infinity)
              .padding(.vertical, 12)
              .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
          .buttonStyle(.plain)
          .padding(.top, 4)
        }
        .padding(20)
      }
      .background(EchoHomeBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Member"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
      }
      .sheet(isPresented: $showingManageRoles) {
        EchoGuildMemberRoleManager(
          server: server,
          member: member,
          model: model
        )
      }
      .confirmationDialog(
        EchoCopy.string("Kick member?"),
        isPresented: $confirmKick,
        titleVisibility: .visible
      ) {
        Button(EchoCopy.string("Kick"), role: .destructive) {
          Task {
            await model.kick(server: server, member: member)
            dismiss()
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: {
        Text(EchoCopy.format("Remove %@ from %@?", member.name, server.name))
      }
      .confirmationDialog(
        EchoCopy.string("Ban member?"),
        isPresented: $confirmBan,
        titleVisibility: .visible
      ) {
        Button(EchoCopy.string("Ban"), role: .destructive) {
          Task {
            await model.ban(server: server, member: member)
            dismiss()
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: {
        Text(EchoCopy.format("Ban %@ from %@?", member.name, server.name))
      }
      .confirmationDialog(
        EchoCopy.string("Timeout member?"),
        isPresented: $confirmTimeout,
        titleVisibility: .visible
      ) {
        Button(EchoCopy.string("Timeout 1 hour"), role: .destructive) {
          Task { await model.timeout(server: server, member: member, minutes: 60) }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: {
        Text(EchoCopy.format("Disable communication for %@?", member.name))
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

  private var header: some View {
    HStack(spacing: 14) {
      EchoMediaImage(source: member.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: member.name, seed: member.userID)
      }
      .clipShape(Circle())
      .frame(width: 64, height: 64)

      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Text(member.name)
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.94))
            .lineLimit(2)
          if isOwner {
            Image(systemName: "crown.fill")
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ownerCrown)
              .accessibilityLabel(EchoCopy.string("Server owner"))
          }
        }
        if let username = member.username, !username.isEmpty {
          Text("@\(username)")
            .font(.system(size: 14, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
      }
      Spacer(minLength: 0)
    }
  }

  private var rolesSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(EchoCopy.string("Roles"))
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
        Spacer()
        if model.canManageRolesUI(for: server.id) {
          Button(EchoCopy.string("Manage")) {
            showingManageRoles = true
          }
          .font(.system(size: 13, weight: .semibold, design: .rounded))
        }
      }

      if roles.isEmpty {
        Text(EchoCopy.string("No roles"))
          .font(.system(size: 14, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.40))
      } else {
        FlowRoleChips(roles: roles, preferLight: preferLight)
      }
    }
  }

  @ViewBuilder
  private var moderationSection: some View {
    let kick = model.canKick(server, targetUserID: member.userID)
    let ban = model.canBan(server, targetUserID: member.userID)
    let timeout = model.canTimeout(server, targetUserID: member.userID)
    if kick || ban || timeout {
      VStack(alignment: .leading, spacing: 8) {
        Text(EchoCopy.string("Moderation"))
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
        if timeout {
          Button {
            confirmTimeout = true
          } label: {
            modRow(title: EchoCopy.string("Timeout"), systemImage: "clock.badge.exclamationmark")
          }
          .buttonStyle(.plain)
        }
        if kick {
          Button {
            confirmKick = true
          } label: {
            modRow(title: EchoCopy.string("Kick"), systemImage: "figure.walk", destructive: true)
          }
          .buttonStyle(.plain)
        }
        if ban {
          Button {
            confirmBan = true
          } label: {
            modRow(title: EchoCopy.string("Ban"), systemImage: "hammer.fill", destructive: true)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func modRow(title: String, systemImage: String, destructive: Bool = false) -> some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .font(.system(size: 14, weight: .semibold))
        .frame(width: 20)
      Text(title)
        .font(.system(size: 15, weight: .medium, design: .rounded))
      Spacer()
    }
    .foregroundStyle(destructive ? Color.red.opacity(0.9) : EchoTheme.Color.ink(0.88))
    .padding(.vertical, 10)
    .padding(.horizontal, 12)
    .background(EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func labeledRow(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.45))
      Text(value)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.88))
    }
  }

  private var isOwner: Bool {
    guard let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !owner.isEmpty
    else { return false }
    return owner == member.userID
  }

  private var isTimedOut: Bool {
    guard let until = member.communicationTimeoutUntil,
      let date = ISO8601DateFormatter().date(from: until)
    else { return false }
    return date > Date()
  }

  private var formattedJoinedAt: String? {
    guard let raw = member.joinedAt, !raw.isEmpty else { return nil }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = iso.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    guard let date else { return raw }
    return date.formatted(date: .abbreviated, time: .omitted)
  }
}

struct EchoGuildMemberRoleManager: View {
  let server: EchoServerSummary
  let member: EchoServerMember
  let model: EchoServersModel

  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme

  private var preferLight: Bool { colorScheme == .light }
  private var assignable: [EchoServerRole] {
    model.roles(for: server.id)
      .filter { !$0.isEveryone }
      .sorted { $0.position > $1.position }
  }

  var body: some View {
    NavigationStack {
      List {
        ForEach(assignable) { role in
          let assigned = model.roleIDs(for: server.id, userID: member.userID).contains(role.id)
          let canAssign = model.canMutateRole(
            server: server, targetUserID: member.userID, roleID: role.id, assign: true)
          let canRemove = model.canMutateRole(
            server: server, targetUserID: member.userID, roleID: role.id, assign: false)
          let canToggle = assigned ? canRemove : canAssign
          Button {
            guard canToggle, !model.isRoleMutationBusy else { return }
            Task {
              await model.toggleRole(
                server: server,
                targetUserID: member.userID,
                roleID: role.id,
                assign: !assigned
              )
            }
          } label: {
            HStack(spacing: 12) {
              Circle()
                .fill(Color(hex: role.displayColor(preferLight: preferLight)) ?? EchoTheme.Color.ink(0.35))
                .frame(width: 12, height: 12)
              Text(role.name)
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(
                  canToggle ? EchoTheme.Color.ink(0.92) : EchoTheme.Color.ink(0.40))
              Spacer()
              Image(systemName: assigned ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(
                  assigned
                    ? (Color(hex: role.displayColor(preferLight: preferLight))
                      ?? EchoTheme.Color.ink(0.55))
                    : EchoTheme.Color.ink(0.28)
                )
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .disabled(!canToggle || model.isRoleMutationBusy)
          .listRowBackground(Color.clear)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(EchoHomeBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Manage roles"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
      }
    }
  }
}

/// Simple wrapping chip row for assigned roles.
private struct FlowRoleChips: View {
  let roles: [EchoServerRole]
  let preferLight: Bool

  var body: some View {
    FlexibleRoleChipLayout(spacing: 8) {
      ForEach(roles) { role in
        Text(role.name)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.88))
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(
            (Color(hex: role.displayColor(preferLight: preferLight)) ?? EchoTheme.Color.ink(0.2))
              .opacity(0.22),
            in: Capsule()
          )
          .overlay(
            Capsule().stroke(
              (Color(hex: role.displayColor(preferLight: preferLight)) ?? EchoTheme.Color.ink(0.3))
                .opacity(0.45),
              lineWidth: 1
            )
          )
      }
    }
  }
}

/// Minimal wrap layout for role chips (avoids a heavy dependency).
private struct FlexibleRoleChipLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let maxWidth = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var height: CGFloat = 0
    for sub in subviews {
      let size = sub.sizeThatFits(.unspecified)
      if x + size.width > maxWidth, x > 0 {
        y += rowHeight + spacing
        x = 0
        rowHeight = 0
      }
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      height = max(height, y + rowHeight)
    }
    return CGSize(width: maxWidth.isFinite ? maxWidth : x, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0
    for sub in subviews {
      let size = sub.sizeThatFits(.unspecified)
      if x + size.width > bounds.maxX, x > bounds.minX {
        y += rowHeight + spacing
        x = bounds.minX
        rowHeight = 0
      }
      sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
    }
  }
}
