import SwiftUI

extension EchoSettingDetailView {
  @ViewBuilder
  func accountSections(model: EchoSettingDetailModel) -> some View {
    @Bindable var model = model
    EchoDetailSection(title: EchoCopy.string("Identity")) {
      EchoSettingValueRow(
        title: EchoCopy.string("Username"),
        value: model.accountState.username.isEmpty
          ? EchoCopy.string("Not set") : "@\(model.accountState.username)",
        icon: "at", tint: .purple
      ) { showUsernameEditor = true }
      EchoSettingValueRow(
        title: EchoCopy.string("Email address"),
        value: model.accountState.email.isEmpty
          ? EchoCopy.string("Not set") : obfuscatedEmail(model.accountState.email),
        icon: "envelope.fill", tint: .orange,
        statusIcon: model.accountState.emailVerified
          ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
        statusTint: model.accountState.emailVerified ? .green : .orange
      ) { showEmailEditor = true }
      if !model.accountState.emailVerified && !model.accountState.email.isEmpty {
        EchoSettingAction(
          title: EchoCopy.string("Resend verification email"),
          subtitle: EchoCopy.string("Send a fresh verification link"),
          icon: "envelope.badge.fill", tint: .orange
        ) { model.resendEmailVerification() }
      }
      EchoSettingValueRow(
        title: EchoCopy.string("Phone number"),
        value: model.accountState.phone.isEmpty
          ? EchoCopy.string("Not set") : model.accountState.phone,
        icon: "phone.fill", tint: .blue,
        statusIcon: model.accountState.phoneVerified
          ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
        statusTint: model.accountState.phoneVerified ? .green : .orange
      ) { showPhoneEditor = true }
      if !model.accountState.phoneVerified && !model.accountState.phone.isEmpty {
        EchoSettingAction(
          title: EchoCopy.string("Send phone verification code"),
          subtitle: EchoCopy.string("Text a one-time verification code"),
          icon: "message.badge.filled.fill", tint: .blue
        ) {
          model.sendPhoneCode()
          showPhoneCodeSheet = true
        }
        EchoSettingValueRow(
          title: EchoCopy.string("Verification code"),
          value: model.phoneVerificationCode.isEmpty
            ? EchoCopy.string("Enter the code you received") : EchoCopy.string("Code entered"),
          icon: "number.square.fill", tint: .green
        ) { showPhoneCodeSheet = true }
        EchoSettingAction(
          title: EchoCopy.string("Verify phone"),
          subtitle: EchoCopy.string("Confirm the code you received"),
          icon: "checkmark.shield.fill", tint: .green
        ) { model.verifyPhone() }
        .disabled(model.phoneVerificationCode.isEmpty)
      }
    }
    EchoDetailSection(title: EchoCopy.string("Sign-in security")) {
      EchoSettingAction(
        title: EchoCopy.string("Change password"),
        subtitle: EchoCopy.string("Update the password used for Echo sign-in"),
        icon: "key.fill", tint: .orange
      ) { showPasswordSheet = true }
      EchoSettingAction(
        title: model.accountState.totpEnabled
          ? EchoCopy.string("Manage two-factor authentication")
          : EchoCopy.string("Set up two-factor authentication"),
        subtitle: model.accountState.totpEnabled
          ? EchoCopy.string("Authenticator protection is enabled")
          : EchoCopy.string("Add another layer of account security"),
        icon: "lock.shield.fill", tint: .green
      ) { showTotpSheet = true }
      if model.accountState.totpEnabled {
        EchoSettingAction(
          title: EchoCopy.string("Disable two-factor authentication"),
          subtitle: EchoCopy.string("Remove authenticator protection"),
          icon: "lock.open.fill", tint: .red, role: .destructive
        ) { showDisableTotp = true }
      }
      ForEach(model.passkeys) { passkey in
        EchoPasskeyRow(
          passkey: passkey,
          onRename: {
            model.passkeyToRename = passkey
            model.passkeyRenameLabel = passkey.label
          },
          onRemove: { model.revokePasskey(passkey) })
      }
      EchoSettingAction(
        title: EchoCopy.string("Add passkey"),
        subtitle: EchoCopy.string("Use Face ID or Touch ID for faster sign-in"),
        icon: "person.badge.key.fill", tint: .purple
      ) { showPasskeyRegistration = true }
    }
    EchoDetailSection(title: EchoCopy.string("Active sessions")) {
      ForEach(model.sessions) { session in
        EchoSessionRow(session: session) { model.revokeSession(session) }
      }
      EchoSettingAction(
        title: EchoCopy.string("Sign out all other sessions"),
        subtitle: EchoCopy.string("Keep this device signed in"),
        icon: "rectangle.portrait.and.arrow.right", tint: .orange
      ) { model.signOutOtherSessions() }
    }
    EchoDetailSection(title: EchoCopy.string("Danger zone")) {
      EchoSettingAction(
        title: EchoCopy.string("Delete Echo account"),
        subtitle: EchoCopy.string("Permanently remove your account and data"),
        icon: "trash.fill", tint: .red, role: .destructive
      ) { showDeleteConfirmation = true }
    }
  }

  @ViewBuilder
  func externalLinkSection(model: EchoSettingDetailModel) -> some View {
    let providerID = route.externalProviderID
    EchoDetailSection(title: EchoCopy.string("Connected apps")) {
      if let externalLinkStatus = model.externalLinkStatus {
        Label(
          externalLinkStatus
            ? EchoCopy.string("Connected to Echo") : EchoCopy.string("Not connected"),
          systemImage: externalLinkStatus ? "checkmark.circle.fill" : "circle"
        )
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(externalLinkStatus ? .green : .secondary)
      }
      if route == .google, model.externalLinkStatus == true {
        EchoSettingAction(
          title: model.isDisconnectingExternalLink
            ? EchoCopy.string("Disconnecting…") : EchoCopy.string("Disconnect Google"),
          subtitle: EchoCopy.string("Remove Google sign-in and linked access"),
          icon: "xmark.circle.fill", tint: .red, role: .destructive
        ) { model.disconnectGoogle() }
        .disabled(model.isDisconnectingExternalLink)
      } else if let providerID {
        EchoSettingAction(
          title: model.linkingProvider == providerID
            ? EchoCopy.string("Opening secure sign-in…")
            : model.externalLinkStatus == true
              ? EchoCopy.format("Manage %@ link", title)
              : EchoCopy.format("Connect %@", title),
          subtitle: model.externalLinkStatus == true
            ? EchoCopy.string("Review the connected account in a secure browser")
            : EchoCopy.string("Authorize securely and return to Echo"),
          icon: icon, tint: tint
        ) { model.startExternalLink(providerID, openURL: openURL) }
        .disabled(model.linkingProvider != nil)
      }
      Text(
        route == .discord && model.externalLinkStatus == true
          ? EchoCopy.string("Discord unlinking is managed by Echo support.")
          : EchoCopy.string(
            "You will complete authorization in Apple’s secure browser session and return to Echo when finished."
          )
      ).font(.footnote).foregroundStyle(.secondary)
    }
  }
}
