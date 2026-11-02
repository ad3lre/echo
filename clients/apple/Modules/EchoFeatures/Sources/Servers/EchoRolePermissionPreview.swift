import EchoDomain
import EchoNetworking
import SwiftUI

/// Web `ServerSettingsPermissionPreviewSection` — effective permissions for a member (explain API)
/// or the grants of a single role.
struct EchoRolePermissionPreview: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var initialRoleID: String? = nil

  private enum Subject: Hashable { case member, role }

  private struct LoadKey: Hashable {
    let subject: Subject
    let memberID: String
    let channelID: String
  }

  @State private var subject = Subject.member
  @State private var memberID = ""
  @State private var roleID = ""
  @State private var channelID = ""
  @State private var explain: EchoPermissionExplain?
  @State private var isLoading = false
  @State private var errorMessage: String?

  private var members: [EchoServerMember] { model.members(for: server.id) }
  private var roles: [EchoServerRole] { model.roles(for: server.id) }
  private var channels: [EchoGuildChannel] {
    model.channels(for: server.id).filter(\.isListable)
  }

  private var role: EchoServerRole? { roles.first { $0.id == roleID } }

  private var grants: Set<String> {
    switch subject {
    case .member: Set(explain?.effective ?? [])
    case .role: Set(role?.permissions ?? [])
    }
  }

  private var summary: String? {
    switch subject {
    case .member: explain?.summary
    case .role: nil
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Permission preview"),
        subtitle: EchoCopy.string(
          "See what a member or role can do here, after roles and channel overwrites."))
      Picker(EchoCopy.string("Preview"), selection: $subject) {
        Text(EchoCopy.string("Member")).tag(Subject.member)
        Text(EchoCopy.string("Role")).tag(Subject.role)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      pickers
      if let errorMessage {
        Text(errorMessage)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      } else if isLoading {
        ProgressView().controlSize(.small)
      } else {
        result
      }
    }
    .padding(14)
    .background(
      EchoTheme.Color.ink(0.035), in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .onAppear {
      if roleID.isEmpty { roleID = initialRoleID ?? roles.first?.id ?? "" }
      if memberID.isEmpty { memberID = model.currentUserID ?? members.first?.userID ?? "" }
    }
    .onChange(of: initialRoleID) { _, next in
      if let next { roleID = next }
    }
    .task(id: LoadKey(subject: subject, memberID: memberID, channelID: channelID)) {
      await load()
    }
  }

  @ViewBuilder
  private var pickers: some View {
    switch subject {
    case .member:
      EchoSettingsPickerField(
        title: EchoCopy.string("Member"),
        selection: $memberID,
        options: members.map { ($0.userID, $0.name) },
        searchable: members.count > 12
      )
      EchoSettingsPickerField(
        title: EchoCopy.string("Channel context"),
        selection: $channelID,
        options: [("", EchoCopy.string("Server-wide (no channel layer)"))]
          + channels.map { ($0.id, $0.name) },
        searchable: channels.count > 12
      )
      Button(EchoCopy.string("Refresh")) { Task { await load() } }
        .buttonStyle(.bordered)
        .disabled(isLoading)
    case .role:
      EchoSettingsPickerField(
        title: EchoCopy.string("Role"),
        selection: $roleID,
        options: roles.map { ($0.id, $0.name) }
      )
    }
  }

  @ViewBuilder
  private var result: some View {
    if explain?.ownerBypass == true, subject == .member {
      Text(EchoCopy.string("This member owns the server, so every permission applies."))
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.7))
    }
    if let summary, !summary.isEmpty {
      Text(summary)
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.6))
    }
    let allowed = grants
    let isOwner = subject == .member && explain?.ownerBypass == true
    ForEach(EchoServerSettingsPermission.grouped, id: \.group) { group in
      VStack(alignment: .leading, spacing: 4) {
        Text(group.group.uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.4)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        ForEach(group.items) { permission in
          let on = isOwner || EchoServerSettingsPermission.isEnabled(permission, in: allowed)
          Label(permission.label, systemImage: on ? "checkmark.circle.fill" : "minus.circle")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(on ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.38))
        }
      }
    }
  }

  private func load() async {
    guard subject == .member, !memberID.isEmpty else {
      errorMessage = nil
      return
    }
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      explain = try await model.client.fetchPermissionExplain(
        serverID: server.id, channelID: channelID, targetUserID: memberID, accessToken: token)
    } catch {
      explain = nil
      errorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load that permission preview."))
    }
  }
}
