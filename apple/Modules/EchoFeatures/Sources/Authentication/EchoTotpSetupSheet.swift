import EchoNetworking
import SwiftUI

struct EchoTotpSetupSheet: View {
  let baseURL: URL
  let accessToken: String
  @Environment(\.dismiss) private var dismiss
  @State private var currentPassword = ""
  @State private var secret = ""
  @State private var otpauthURL = ""
  @State private var code = ""
  @State private var errorMessage: String?
  @State private var isLoading = false
  @State private var isEnabled = false

  var body: some View {
    EchoSettingsSheetShell(
      title: "Two-factor authentication",
      description: "Add another layer of protection to your Echo account.",
      icon: "lock.shield.fill", tint: .green, onCancel: { dismiss() },
      content: {
        if secret.isEmpty {
          EchoSettingsSheetField(
            title: "Current password", icon: "lock.fill", tint: .orange,
            value: $currentPassword, isSecure: true)
          EchoSettingAction(
            title: isLoading ? "Preparing…" : "Begin setup",
            subtitle: "Generate a secret for your authenticator app",
            icon: "arrow.right.circle.fill", tint: .green
          ) { begin() }
          .disabled(isLoading || currentPassword.isEmpty)
        } else if !isEnabled {
          VStack(alignment: .leading, spacing: 10) {
            Text("Authenticator secret")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.55))
            Text(secret)
              .font(.system(size: 14, weight: .semibold, design: .monospaced))
              .textSelection(.enabled)
              .foregroundStyle(.white)
            if !otpauthURL.isEmpty {
              Text(otpauthURL).font(.caption).textSelection(.enabled).foregroundStyle(.secondary)
            }
          }
          .padding(14)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            .white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
          EchoSettingsSheetField(
            title: "6-digit code", icon: "number.square.fill", tint: .blue, value: $code,
            keyboard: .numberPad)
          EchoSettingAction(
            title: "Confirm two-factor authentication",
            subtitle: "Verify the code from your authenticator",
            icon: "checkmark.shield.fill", tint: .green
          ) { confirm() }
          .disabled(code.count < 6)
        } else {
          Label("Two-factor authentication enabled", systemImage: "checkmark.shield.fill")
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(.green)
        }
        if let errorMessage {
          Text(errorMessage).font(.footnote).foregroundStyle(.red)
        }
      })
  }

  private func begin() {
    isLoading = true
    Task {
      do {
        let data = try await EchoSettingsClient(baseURL: baseURL).beginTotp(
          currentPassword: currentPassword, accessToken: accessToken)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        secret = object?["secretBase32"] as? String ?? ""
        otpauthURL = object?["otpauthUrl"] as? String ?? ""
      } catch { errorMessage = error.localizedDescription }
      isLoading = false
    }
  }

  private func confirm() {
    Task {
      do {
        _ = try await EchoSettingsClient(baseURL: baseURL).confirmTotp(
          code: code, currentPassword: currentPassword, accessToken: accessToken)
        isEnabled = true
      } catch { errorMessage = error.localizedDescription }
    }
  }
}
