import EchoDomain
import SwiftUI

struct EchoServerSettingsSelfRolesPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var enabled = false
  @State private var channelName = "roles"
  @State private var loading = false
  @State private var savedFlash = false

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if loading {
        ProgressView()
      } else {
        Toggle(isOn: $enabled) {
          VStack(alignment: .leading, spacing: 2) {
            Text(EchoCopy.string("Enable self-assignable roles"))
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
            Text(EchoCopy.string("Creates a roles channel where members can pick roles."))
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.48))
          }
        }
        .toggleStyle(.switch)
        .padding(14)
        .background(
          EchoTheme.Color.ink(0.035),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )

        EchoDesktopLabeledField(title: EchoCopy.string("Channel name")) {
          TextField(EchoCopy.string("roles"), text: $channelName)
        }

        Text(
          EchoCopy.string(
            "Mark roles as Self-selectable in the Roles section to include them."
          )
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.48))

        HStack {
          if savedFlash {
            Text(EchoCopy.string("Saved"))
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(EchoTheme.Color.presenceOnline)
          }
          Spacer()
          EchoDesktopPrimaryButton(title: EchoCopy.string("Save Changes")) {
            Task { await save() }
          }
        }
      }
    }
    .task { await reload() }
  }

  private func reload() async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      let config = try await model.client.loadSelfRolesConfig(
        serverID: server.id, accessToken: token)
      enabled = config.enabled
      channelName = config.channelName ?? "roles"
    } catch {
      localError = EchoCopy.string("Echo couldn’t load self-roles settings.")
    }
  }

  private func save() async {
    localError = nil
    savedFlash = false
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.patchSelfRolesConfig(
        serverID: server.id,
        enabled: enabled,
        channelName: channelName.trimmingCharacters(in: .whitespacesAndNewlines),
        accessToken: token
      )
      savedFlash = true
    } catch {
      localError = EchoCopy.string("Echo couldn’t save self-roles settings.")
    }
  }
}
