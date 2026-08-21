import EchoNetworking
import SwiftUI


enum EchoAccountKeyboard {
  case username
  case emailAddress
  case phonePad
  case numberPad
}

func obfuscatedEmail(_ email: String) -> String {
  let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let at = value.firstIndex(of: "@"), at > value.startIndex else {
    return value.isEmpty ? EchoCopy.string("Not set") : "•••"
  }

  let local = value[..<at]
  let domain = value[value.index(after: at)...]
  let localPrefix = String(local.prefix(1))
  let domainParts = domain.split(separator: ".", omittingEmptySubsequences: true)
  guard let host = domainParts.first else { return "\(localPrefix)•••@•••" }
  let suffix = domainParts.dropFirst().joined(separator: ".")
  let maskedHost = "\(host.prefix(1))•••"
  return suffix.isEmpty
    ? "\(localPrefix)•••@\(maskedHost)"
    : "\(localPrefix)•••@\(maskedHost).\(suffix)"
}

struct EchoAccountFieldSheet: View {
  @Environment(\.dismiss) private var dismiss
  let title: String
  let prompt: String
  @Binding var value: String
  let keyboard: EchoAccountKeyboard
  let onSave: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 22) {
          EchoDetailHeader(
            title: title, description: EchoCopy.string("Keep your Echo account details up to date."),
            icon: fieldIcon, tint: .purple)
          VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
              .font(.system(size: 11, weight: .bold, design: .rounded))
              .tracking(1.8)
              .foregroundStyle(.white.opacity(0.42))
            TextField(prompt, text: $value)
              .font(.system(size: 17, weight: .medium, design: .rounded))
              .foregroundStyle(.white)
              .padding(.horizontal, 16)
              .frame(minHeight: 54)
              .background(
                .white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                  .stroke(.white.opacity(0.12), lineWidth: 1)
              }
              #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(uiKeyboardType)
              #endif
          }
          EchoSettingAction(
            title: EchoCopy.format("Save %@", title.lowercased()), subtitle: EchoCopy.string("Apply this change to your Echo account"),
            icon: "checkmark.circle.fill", tint: .purple
          ) {
            onSave()
            dismiss()
          }
          .disabled(!canSave)
        }
        .padding(20)
      }
      .background(EchoSettingsBackdrop().ignoresSafeArea())
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Cancel")) { dismiss() }
        }
      }
      .tint(.white)
    }
  }

  #if os(iOS)
    private var uiKeyboardType: UIKeyboardType {
      switch keyboard {
      case .username: .default
      case .emailAddress: .emailAddress
      case .phonePad: .phonePad
      case .numberPad: .numberPad
      }
    }
  #endif

  private var canSave: Bool {
    guard keyboard == .username else { return true }
    return !value.trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "@")).isEmpty
  }

  private var fieldIcon: String {
    switch keyboard {
    case .username: "at"
    case .emailAddress: "envelope.fill"
    case .phonePad: "phone.fill"
    case .numberPad: "number.square.fill"
    }
  }
}

struct EchoDeleteAccountSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var password: String
  @Binding var totpCode: String
  let onDelete: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: EchoCopy.string("Delete Echo account"),
      description: EchoCopy.string("This permanently removes your account and associated data."),
      icon: "trash.fill", tint: .red, onCancel: { dismiss() },
      content: {
        VStack(alignment: .leading, spacing: 10) {
          Label(EchoCopy.string("This cannot be undone"), systemImage: "exclamationmark.triangle.fill")
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(.red)
          EchoCopy.text("Enter your password if your account requires one, plus an authenticator code when 2FA is enabled, then confirm deletion.")
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(.white.opacity(0.54))
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(.red.opacity(0.22), lineWidth: 1)
        }
        EchoSettingsSheetField(
          title: EchoCopy.string("Password (if required)"), icon: "lock.fill", tint: .red,
          value: $password, isSecure: true)
        EchoSettingsSheetField(
          title: EchoCopy.string("Authenticator code (if enabled)"), icon: "lock.shield.fill", tint: .orange,
          value: $totpCode, keyboard: .numberPad)
        EchoSettingAction(
          title: EchoCopy.string("Delete permanently"), subtitle: EchoCopy.string("Remove Echo account and data"),
          icon: "trash.fill", tint: .red, role: .destructive
        ) {
          onDelete()
          dismiss()
        }
      })
  }
}

struct EchoSettingsErrorSheet: View {
  @Environment(\.dismiss) private var dismiss
  let message: String
  let onRetry: () -> Void
  let onDismiss: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: EchoCopy.string("Couldn’t complete that"),
      description: EchoCopy.string("Echo ran into a problem while saving this setting."),
      icon: "exclamationmark.triangle.fill", tint: .orange,
      onCancel: {
        onDismiss()
        dismiss()
      },
      content: {
        Text(message)
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(.white.opacity(0.68))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(16)
          .background(
            .orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .stroke(.orange.opacity(0.22), lineWidth: 1)
          }
        EchoSettingAction(
          title: EchoCopy.string("Try again"), subtitle: EchoCopy.string("Retry this setting now"),
          icon: "arrow.clockwise", tint: .indigo
        ) {
          onRetry()
          dismiss()
        }
        EchoSettingAction(
          title: EchoCopy.string("Dismiss"), subtitle: EchoCopy.string("Return to your Echo settings"),
          icon: "xmark.circle.fill", tint: .orange
        ) {
          onDismiss()
          dismiss()
        }
      })
  }
}

struct EchoPasskeyRenameSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var label: String
  let onSave: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: EchoCopy.string("Rename passkey"), description: EchoCopy.string("Give this secure sign-in a name you recognize."),
      icon: "pencil", tint: .purple, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: EchoCopy.string("Passkey name"), icon: "tag.fill", tint: .purple, value: $label)
        EchoSettingAction(
          title: EchoCopy.string("Save name"), subtitle: EchoCopy.string("Update this passkey on Echo"),
          icon: "checkmark.circle.fill", tint: .purple
        ) {
          onSave()
          dismiss()
        }
        .disabled(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      })
  }
}

struct EchoDisableTotpSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var password: String
  @Binding var code: String
  @Binding var recoveryCode: String
  let onDisable: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: EchoCopy.string("Disable two-factor authentication"),
      description: EchoCopy.string("Confirm your identity before removing authenticator protection."),
      icon: "lock.open.fill", tint: .red, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: EchoCopy.string("Current password"), icon: "lock.fill", tint: .orange,
          value: $password, isSecure: true)
        EchoSettingsSheetField(
          title: EchoCopy.string("Authenticator code"), icon: "number.square.fill", tint: .blue,
          value: $code, keyboard: .numberPad)
        EchoSettingsSheetField(
          title: EchoCopy.string("Recovery code (alternative)"), icon: "lifepreserver.fill", tint: .purple,
          value: $recoveryCode)
        EchoSettingAction(
          title: EchoCopy.string("Disable two-factor authentication"),
          subtitle: EchoCopy.string("Remove authenticator protection from this account"),
          icon: "lock.open.fill", tint: .red, role: .destructive
        ) {
          onDisable()
          dismiss()
        }
      })
  }
}
