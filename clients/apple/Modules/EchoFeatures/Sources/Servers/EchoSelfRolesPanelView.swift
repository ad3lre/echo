import EchoDomain
import SwiftUI

/// Web `SelfAssignableRolesWidget` — the whole surface of the managed self-roles channel.
struct EchoSelfRolesPanelView: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let servers: EchoServersModel
  var onRequestExit: (() -> Void)? = nil

  @Environment(\.colorScheme) private var colorScheme
  @State private var model: EchoSelfRolesModel?
  @State private var activeCategoryID: String?

  var body: some View {
    VStack(spacing: 0) {
      header
      content
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task(id: server.id) {
      let loaded = EchoSelfRolesModel(
        serverID: server.id, client: servers.client, auth: servers.auth)
      model = loaded
      await loaded.load()
    }
  }

  private var title: String {
    let name = channel.name.trimmingCharacters(in: .whitespacesAndNewlines)
    return name.isEmpty || name == "self-assignable-roles"
      ? EchoCopy.string("Self-assignable roles") : name
  }

  private var header: some View {
    HStack(spacing: 10) {
      if let onRequestExit {
        Button(action: onRequestExit) {
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Show channels"))
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.96))
          .lineLimit(1)
        Text(server.name)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .lineLimit(1)
      }
      Spacer(minLength: 8)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }

  @ViewBuilder
  private var content: some View {
    if let model, let panel = model.panel {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 14) {
          summary(panel)
          if let error = model.errorMessage { errorLabel(error) }
          if panel.categories.isEmpty {
            empty
          } else {
            categoryTabs(panel.categories)
            roleList(model: model, panel: panel)
          }
        }
        .padding(16)
      }
    } else if let model, let error = model.errorMessage {
      VStack(spacing: 10) {
        errorLabel(error)
        Button(EchoCopy.string("Try again")) { Task { await model.load() } }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func summary(_ panel: EchoSelfRolesPanel) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(
        EchoCopy.string(
          "Choose the roles you qualify for. You can only pick roles whose permissions are a subset of what you already have."
        )
      )
      .font(.system(size: 13, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.55))
      .fixedSize(horizontal: false, vertical: true)
      if panel.totalRoleCount > 0 {
        Text(
          EchoCopy.format(
            "%lld assigned · %lld available", panel.assignedRoleIDs.count, panel.totalRoleCount)
        )
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
      }
    }
  }

  private var empty: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(EchoCopy.string("Nothing to assign yet"))
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(
        EchoCopy.string(
          "A server admin needs to mark roles as Self-selectable and expose them in synced role categories or channels under Server Settings."
        )
      )
      .font(.system(size: 13, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.55))
      .fixedSize(horizontal: false, vertical: true)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  @ViewBuilder
  private func categoryTabs(_ categories: [EchoSelfRolesCategory]) -> some View {
    if categories.count > 1 {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
          ForEach(categories) { category in
            let active = (activeCategory(in: categories)?.id == category.id)
            Button {
              activeCategoryID = category.id
            } label: {
              Text(verbatim: "\(category.name) \(category.roles.count)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(active ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.55))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                  active ? EchoTheme.Color.ink(0.12) : EchoTheme.Color.ink(0.05), in: Capsule())
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }

  private func activeCategory(in categories: [EchoSelfRolesCategory]) -> EchoSelfRolesCategory? {
    categories.first { $0.id == activeCategoryID } ?? categories.first
  }

  private func roleList(model: EchoSelfRolesModel, panel: EchoSelfRolesPanel) -> some View {
    VStack(spacing: 8) {
      ForEach(activeCategory(in: panel.categories)?.roles ?? []) { role in
        let assigned = panel.assignedRoleIDs.contains(role.id)
        let accent =
          Color(hex: role.displayColor(preferLight: colorScheme == .light))
          ?? EchoTheme.Color.ink(0.35)
        HStack(spacing: 12) {
          Circle().fill(accent).frame(width: 10, height: 10)
          Text(role.name)
            .font(.system(size: 15, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
            .lineLimit(1)
          Spacer(minLength: 8)
          Toggle(
            "",
            isOn: Binding(
              get: { assigned },
              set: { next in Task { await model.toggle(roleID: role.id, assign: next) } })
          )
          .labelsHidden()
          .disabled(model.busyRoleID != nil)
          .accessibilityLabel(
            assigned
              ? EchoCopy.format("Remove role %@", role.name)
              : EchoCopy.format("Assign role %@", role.name))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
          accent.opacity(assigned ? 0.14 : 0.07),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
  }

  private func errorLabel(_ message: String) -> some View {
    Text(message)
      .font(.system(size: 13, weight: .medium, design: .rounded))
      .foregroundStyle(EchoTheme.Color.mentionPing)
  }
}
