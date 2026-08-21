import EchoNetworking
import SwiftUI

struct EchoPasskeyRegistrationSheet: View {
  let baseURL: URL
  let accessToken: String
  let onRegistered: () -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var label = "This device"
  @State private var password = ""
  @State private var totpCode = ""
  @State private var errorMessage: String?
  @State private var isWorking = false

  var body: some View {
    EchoSettingsSheetShell(
      title: EchoCopy.string("Add passkey"),
      description: EchoCopy.string("Use Face ID, Touch ID, or your device passcode to sign in faster."),
      icon: "person.badge.key.fill", tint: .purple, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: EchoCopy.string("Passkey name"), icon: "tag.fill", tint: .purple, value: $label)
        EchoSettingsSheetField(
          title: EchoCopy.string("Current password"), icon: "lock.fill", tint: .orange, value: $password,
          isSecure: true)
        EchoSettingsSheetField(
          title: EchoCopy.string("Authenticator code (if enabled)"), icon: "number.square.fill", tint: .blue,
          value: $totpCode, keyboard: .numberPad)
        EchoSettingAction(
          title: isWorking ? EchoCopy.string("Waiting for Face ID…") : EchoCopy.string("Add passkey"),
          subtitle: EchoCopy.string("Register this device as a secure Echo sign-in"),
          icon: "person.badge.key.fill", tint: .purple
        ) { register() }
        .disabled(
          isWorking || password.isEmpty
            || label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        if let errorMessage {
          Text(errorMessage).font(.footnote).foregroundStyle(.red)
        }
      })
  }

  private func register() {
    isWorking = true
    Task {
      do {
        try await EchoPasskeyRegistrationCoordinator.register(
          client: EchoSettingsClient(baseURL: baseURL), accessToken: accessToken,
          currentPassword: password, totpCode: totpCode.isEmpty ? nil : totpCode, label: label)
        onRegistered()
        dismiss()
      } catch { errorMessage = error.localizedDescription }
      isWorking = false
    }
  }
}
