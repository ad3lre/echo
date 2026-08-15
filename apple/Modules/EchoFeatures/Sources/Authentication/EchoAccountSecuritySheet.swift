import EchoNetworking
import SwiftUI

struct EchoPasswordChangeSheet: View {
  let baseURL: URL
  let accessToken: String
  var onPasswordChanged: (() -> Void)? = nil
  @Environment(\.dismiss) private var dismiss
  @State private var current = ""
  @State private var newPassword = ""
  @State private var confirmation = ""
  @State private var totpCode = ""
  @State private var errorMessage: String?
  @State private var isSaving = false

  var body: some View {
    EchoSettingsSheetShell(
      title: "Change password", description: "Protect your Echo account with a new password.",
      icon: "key.fill", tint: .orange, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: "Current password", icon: "lock.fill", tint: .orange, value: $current,
          isSecure: true)
        EchoSettingsSheetField(
          title: "New password", icon: "key.fill", tint: .purple, value: $newPassword,
          isSecure: true)
        EchoSettingsSheetField(
          title: "Confirm new password", icon: "checkmark.shield.fill", tint: .green,
          value: $confirmation, isSecure: true)
        EchoSettingsSheetField(
          title: "Authenticator code (if enabled)", icon: "lock.shield.fill", tint: .blue,
          value: $totpCode, keyboard: .numberPad)
        if let errorMessage {
          Text(errorMessage).font(.footnote).foregroundStyle(.red)
        }
        EchoSettingAction(
          title: isSaving ? "Saving…" : "Save password",
          subtitle: "Update the password used for Echo sign-in",
          icon: "checkmark.circle.fill", tint: .purple
        ) { save() }
        .disabled(isSaving || current.isEmpty || newPassword.isEmpty || newPassword != confirmation)
      })
  }

  private func save() {
    isSaving = true
    Task {
      do {
        try await EchoSettingsClient(baseURL: baseURL).changePassword(
          current: current, new: newPassword,
          totpCode: totpCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil : totpCode.trimmingCharacters(in: .whitespacesAndNewlines),
          accessToken: accessToken)
        onPasswordChanged?()
        dismiss()
      } catch { errorMessage = error.localizedDescription }
      isSaving = false
    }
  }
}
