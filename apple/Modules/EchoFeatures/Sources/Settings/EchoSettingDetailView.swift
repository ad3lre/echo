import EchoNetworking
import SwiftUI
import UserNotifications

struct EchoSettingDetailView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  let route: EchoSettingsRoute
  let icon: String
  let tint: Color
  let baseURL: URL
  let accessToken: String
  let onSignOut: () -> Void
  @AppStorage("echo.settings.appearance.reduceMotion") private var reduceMotion = false
  @AppStorage("echo.settings.accessibility.largerText") private var largerText = false
  @AppStorage("echo.settings.time24Hour") private var uses24HourTime = false
  @AppStorage("echo.settings.style.syncTheme") private var syncTheme = false
  @AppStorage("echo.settings.style.saturateAccents") private var saturateAccents = false
  @AppStorage("echo.settings.style.theme") private var theme = "dark"
  @AppStorage("echo.settings.style.density") private var density = "comfortable"
  @AppStorage("echo.settings.style.actionRail") private var actionRail = "left"
  @AppStorage("echo.settings.style.fontScale") private var fontScale = 100.0
  @AppStorage("echo.settings.accessibility.highContrast") private var highContrast = false
  @AppStorage("echo.settings.accessibility.messageSpacing") private var showMessageSpacing = true
  @AppStorage("echo.settings.accessibility.dyslexiaFont") private var dyslexiaFont = false
  @AppStorage("echo.settings.accessibility.solidGlass") private var solidGlass = false
  @AppStorage("echo.settings.voice.echoCancellation") private var echoCancellation = true
  @AppStorage("echo.settings.voice.noiseSuppression") private var noiseSuppression = true
  @AppStorage("echo.settings.voice.automaticGainControl") private var automaticGainControl = true
  @AppStorage("echo.settings.voice.inputSensitivity") private var inputSensitivity = 68.0
  @AppStorage("echo.settings.voice.outputVolume") private var outputVolume = 82.0
  @AppStorage("echo.settings.video.quality") private var videoQuality = "720p"
  @AppStorage("echo.settings.voice.inputDevice") private var inputDevice = "default"
  @AppStorage("echo.settings.voice.outputDevice") private var outputDevice = "default"
  @AppStorage("echo.settings.video.cameraDevice") private var cameraDevice = "default"
  @State private var accountState = EchoSettingsAccountState()
  @AppStorage("echo.settings.locale") private var localeIdentifier = "en-US"
  @AppStorage("echo.settings.timezone") private var timezoneIdentifier = "system"
  // These controls intentionally remain device-local, matching the web client's
  // developer settings store. They never leave the device or alter account state.
  @AppStorage("echo.settings.advanced.developerMode") private var developerModeEnabled = false
  @AppStorage("echo.settings.advanced.bugHunter") private var bugHunterEnabled = false
  @AppStorage("echo.settings.advanced.diagnostics") private var diagnosticsEnabled = false
  @State private var notificationSettings = EchoNotificationPreferences()
  @State private var lastPersistedNotificationSettings: EchoNotificationPreferences?
  @State private var pendingNotificationSave: Task<Void, Never>?
  @State private var notificationPreferencesLoaded = false
  @State private var systemNotificationsAuthorized: Bool?
  @State private var isLoadingAccountPreferences = false
  @State private var friendCount = 0
  @State private var incomingRequestCount = 0
  @State private var sessions: [EchoAuthSession] = []
  @State private var passkeys: [EchoPasskeyCredential] = []
  @State private var exportDocument: EchoDataExportDocument?
  @State private var exportFilename = "echo-data-export.json"
  @State private var isExportingData = false
  @State private var showExportExporter = false
  @State private var errorMessage: String?
  @State private var showDeleteConfirmation = false
  @State private var deletePassword = ""
  @State private var deleteTotpCode = ""
  @State private var showPasswordSheet = false
  @State private var passkeyToRename: EchoPasskeyCredential?
  @State private var passkeyRenameLabel = ""
  @State private var showTotpSheet = false
  @State private var phoneVerificationCode = ""
  @State private var showEmailEditor = false
  @State private var showUsernameEditor = false
  @State private var showPhoneEditor = false
  @State private var showPhoneCodeSheet = false
  @State private var showDisableTotp = false
  @State private var totpPassword = ""
  @State private var totpCode = ""
  @State private var totpRecoveryCode = ""
  @State private var showPasskeyRegistration = false
  @State private var linkingProvider: String?
  @State private var externalLinkStatus: Bool?
  @State private var isDisconnectingExternalLink = false
  @State private var isLoadingTimeLanguage = false

  private var title: String { route.title }
  private var settingsClient: EchoSettingsClient { EchoSettingsClient(baseURL: baseURL) }

  var body: some View {
    ScrollView(.vertical, showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 14) {
        EchoSettingDetailHeader(
          title: title, description: detailDescription, icon: icon, tint: tint,
          onBack: { dismiss() })
        switch route {
        case .notifications:
          EchoDetailSection(title: "Message alerts") {
            EchoSettingToggle(
              title: "Allow Echo notifications",
              subtitle: systemNotificationSubtitle,
              icon: "bell.fill", tint: .orange, isOn: $notificationSettings.desktopAlerts
            )
            .onChange(of: notificationSettings.desktopAlerts) { _, isEnabled in
              if isEnabled { requestSystemNotificationPermission() }
            }
            EchoSettingToggle(
              title: "Unread badges", subtitle: "Show unread counts on Echo", icon: "app.badge",
              tint: .pink, isOn: $notificationSettings.unreadBadge)
            EchoSettingToggle(
              title: "Mention highlights", subtitle: "Make mentions stand out in conversations",
              icon: "at", tint: .purple, isOn: $notificationSettings.mentionHighlights)
            EchoSettingAction(
              title: "Manage (notificationPlatformName) notification permissions",
              subtitle: "Open System Settings for Echo alerts", icon: "gearshape.fill",
              tint: .orange
            ) {
              EchoPushRegistration.shared.openSystemNotificationSettings()
            }
            EchoSettingAction(
              title: "Send a test notification",
              subtitle: "Deliver a real local alert in one second",
              icon: "paperplane.fill", tint: .blue
            ) {
              sendTestNotification()
            }
            Label("Echo follows your system notification permissions.", systemImage: "info.circle")
              .font(.footnote).foregroundStyle(.secondary)
          }
        case .sounds:
          EchoSoundsMasterControls(
            soundEffectsEnabled: $notificationSettings.soundEffects,
            masterVolume: $notificationSettings.soundEffectsMasterVolume)
          ForEach(EchoSoundGroup.allCases) { group in
            EchoDetailSection(title: group.title) {
              LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                spacing: 10
              ) {
                ForEach(EchoSoundOption.allCases.filter { $0.group == group }) { sound in
                  EchoSoundWidget(
                    sound: sound,
                    isEnabled: soundBinding(sound.id),
                    volume: soundVolumeBinding(sound.id),
                    masterVolume: notificationSettings.soundEffectsMasterVolume,
                    soundEffectsEnabled: notificationSettings.soundEffects)
                }
              }
              .opacity(notificationSettings.soundEffects ? 1 : 0.45)
              .allowsHitTesting(notificationSettings.soundEffects)
            }
          }
        case .style:
          EchoDetailSection(title: "Motion") {
            EchoSettingChoice(
              title: "Theme", subtitle: "Choose how Echo looks", icon: "circle.lefthalf.filled",
              tint: .indigo, value: $theme,
              options: [("dark", "Dark"), ("light", "Light"), ("system", "System")])
            EchoSettingChoice(
              title: "Density", subtitle: "Control spacing across the app",
              icon: "rectangle.compress.vertical",
              tint: .cyan, value: $density,
              options: [
                ("compact", "Compact"), ("comfortable", "Comfortable"), ("spacious", "Spacious"),
              ])
            EchoSettingChoice(
              title: "Action rail", subtitle: "Choose where actions appear", icon: "sidebar.left",
              tint: .purple, value: $actionRail,
              options: [("left", "Left"), ("top", "Top")])
            EchoSettingSlider(
              title: "Text scale", icon: "textformat.size", tint: .cyan, value: $fontScale,
              range: 85...130, valueScale: 1.0)
            EchoSettingToggle(
              title: "Reduce motion", subtitle: "Use gentler transitions across Echo",
              icon: "figure.walk.motion", tint: .green, isOn: $reduceMotion)
            EchoSettingToggle(
              title: "Sync with system appearance", subtitle: "Follow iPhone Light and Dark Mode",
              icon: "circle.lefthalf.filled", tint: .indigo, isOn: $syncTheme)
            EchoSettingToggle(
              title: "Saturate accent colors", subtitle: "Make Echo colors more vivid",
              icon: "paintpalette.fill", tint: .purple, isOn: $saturateAccents)
            Text("Echo follows your system appearance and keeps its dark-first visual language.")
              .font(.footnote).foregroundStyle(.secondary)
          }
        case .accessibility:
          EchoDetailSection(title: "Readability") {
            EchoSettingToggle(
              title: "Larger text", subtitle: "Increase text size throughout Echo",
              icon: "textformat.size.larger", tint: .green, isOn: $largerText)
            EchoSettingToggle(
              title: "High contrast", subtitle: "Increase separation between surfaces and text",
              icon: "circle.lefthalf.filled.inverse", tint: .orange, isOn: $highContrast)
            EchoSettingToggle(
              title: "Message spacing", subtitle: "Give conversations more breathing room",
              icon: "arrow.up.and.down.text.horizontal", tint: .blue, isOn: $showMessageSpacing)
            EchoSettingToggle(
              title: "Dyslexia-friendly font", subtitle: "Use a more readable typeface",
              icon: "textformat.abc", tint: .purple, isOn: $dyslexiaFont)
            EchoSettingToggle(
              title: "Solid glass surfaces", subtitle: "Reduce translucency for clearer panels",
              icon: "square.fill", tint: .cyan, isOn: $solidGlass)
            Text("Echo uses Dynamic Type throughout native settings.").font(.footnote)
              .foregroundStyle(.secondary)
          }
        case .timeLanguage:
          EchoDetailSection(title: "Time format") {
            EchoSettingToggle(
              title: "24-hour time", subtitle: "Use a 24-hour clock throughout Echo",
              icon: "clock.fill", tint: .mint, isOn: $uses24HourTime)
            EchoSettingChoice(
              title: "Language", subtitle: "Choose Echo’s display language",
              icon: "character.book.closed.fill",
              tint: .blue, value: $localeIdentifier,
              options: EchoLocaleOptions.languages
            )
            .onChange(of: localeIdentifier) { _, value in
              guard !isLoadingTimeLanguage else { return }
              updateLocaleAndTimeZone(
                locale: value, timeZone: timezoneIdentifier == "system" ? nil : timezoneIdentifier)
            }
            EchoSettingChoice(
              title: "Time zone", subtitle: "Choose how timestamps are localized", icon: "globe",
              tint: .orange, value: $timezoneIdentifier,
              options: EchoLocaleOptions.timeZones
            )
            .onChange(of: timezoneIdentifier) { _, value in
              guard !isLoadingTimeLanguage else { return }
              updateLocaleAndTimeZone(
                locale: localeIdentifier, timeZone: value == "system" ? nil : value)
            }
          }
        case .voiceVideo:
          EchoDetailSection(title: "Voice processing") {
            EchoSettingChoice(
              title: "Input device", subtitle: "Choose the microphone Echo uses", icon: "mic.fill",
              tint: .blue, value: $inputDevice,
              options: [("default", "System default"), ("built-in-mic", "Built-in microphone")])
            EchoSettingChoice(
              title: "Output device", subtitle: "Choose where Echo plays audio",
              icon: "speaker.wave.2.fill",
              tint: .purple, value: $outputDevice,
              options: [("default", "System default"), ("built-in-speaker", "Built-in speaker")])
            EchoSettingToggle(
              title: "Echo cancellation", subtitle: "Reduce feedback while you speak",
              icon: "waveform.path.ecg", tint: .green, isOn: $echoCancellation)
            EchoSettingToggle(
              title: "Noise suppression", subtitle: "Keep background noise out of calls",
              icon: "waveform.badge.magnifyingglass", tint: .orange, isOn: $noiseSuppression)
            EchoSettingToggle(
              title: "Automatic gain control", subtitle: "Keep your voice at a steady level",
              icon: "dial.medium.fill", tint: .cyan, isOn: $automaticGainControl)
            EchoSettingSlider(
              title: "Input sensitivity", icon: "mic", tint: .blue, value: $inputSensitivity,
              range: 0...100)
            EchoSettingSlider(
              title: "Output volume", icon: "speaker.wave.2", tint: .purple, value: $outputVolume,
              range: 0...100)
          }
          EchoDetailSection(title: "Camera") {
            EchoSettingChoice(
              title: "Camera", subtitle: "Choose the camera Echo uses", icon: "camera.fill",
              tint: .red, value: $cameraDevice,
              options: [("default", "System default"), ("built-in-camera", "Built-in camera")])
            EchoSettingChoice(
              title: "Video quality", subtitle: "Balance clarity and bandwidth",
              icon: "rectangle.inset.filled.and.person.filled",
              tint: .pink, value: $videoQuality,
              options: [("720p", "720p (HD)"), ("480p", "480p (SD)"), ("360p", "360p")])
          }
        case .friends:
          EchoDetailSection(title: "Privacy") {
            EchoSettingToggle(
              title: "Allow friend requests", subtitle: "Let people send you friend requests",
              icon: "person.badge.plus", tint: .blue, isOn: $accountState.friendsAllowed
            )
            .onChange(of: accountState.friendsAllowed) { _, value in
              guard !isLoadingAccountPreferences else { return }
              updateAccount(["allowFriendRequests": value])
            }
            EchoSettingToggle(
              title: "Allow message requests", subtitle: "Receive messages from new contacts",
              icon: "bubble.left.and.bubble.right.fill", tint: .indigo,
              isOn: $accountState.messagesAllowed
            )
            .onChange(of: accountState.messagesAllowed) { _, value in
              guard !isLoadingAccountPreferences else { return }
              updateAccount(["allowMessageRequests": value])
            }
            EchoSettingToggle(
              title: "Show last online", subtitle: "Let friends see when you were last active",
              icon: "clock.fill", tint: .mint, isOn: $accountState.showLastOnline
            )
            .onChange(of: accountState.showLastOnline) { _, value in
              guard !isLoadingAccountPreferences else { return }
              updateAccount(["showLastOnline": value])
            }
            EchoSettingMetric(
              title: "Friends", value: friendCount, icon: "person.2.fill", tint: .blue)
            EchoSettingMetric(
              title: "Incoming requests", value: incomingRequestCount,
              icon: "tray.and.arrow.down.fill",
              tint: .purple)
          }
        case .account:
          EchoDetailSection(title: "Identity") {
            EchoSettingValueRow(
              title: "Username",
              value: accountState.username.isEmpty ? "Not set" : "@\(accountState.username)",
              icon: "at", tint: .purple
            ) { showUsernameEditor = true }
            EchoSettingValueRow(
              title: "Email address",
              value: accountState.email.isEmpty ? "Not set" : obfuscatedEmail(accountState.email),
              icon: "envelope.fill", tint: .orange,
              statusIcon: accountState.emailVerified
                ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
              statusTint: accountState.emailVerified ? .green : .orange
            ) { showEmailEditor = true }
            if !accountState.emailVerified && !accountState.email.isEmpty {
              EchoSettingAction(
                title: "Resend verification email", subtitle: "Send a fresh verification link",
                icon: "envelope.badge.fill", tint: .orange
              ) { resendEmailVerification() }
            }
            EchoSettingValueRow(
              title: "Phone number",
              value: accountState.phone.isEmpty ? "Not set" : accountState.phone,
              icon: "phone.fill", tint: .blue,
              statusIcon: accountState.phoneVerified
                ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
              statusTint: accountState.phoneVerified ? .green : .orange
            ) { showPhoneEditor = true }
            if !accountState.phoneVerified && !accountState.phone.isEmpty {
              EchoSettingAction(
                title: "Send phone verification code",
                subtitle: "Text a one-time verification code",
                icon: "message.badge.filled.fill", tint: .blue
              ) {
                sendPhoneCode()
                showPhoneCodeSheet = true
              }
              EchoSettingValueRow(
                title: "Verification code",
                value: phoneVerificationCode.isEmpty
                  ? "Enter the code you received" : "Code entered",
                icon: "number.square.fill", tint: .green
              ) { showPhoneCodeSheet = true }
              EchoSettingAction(
                title: "Verify phone", subtitle: "Confirm the code you received",
                icon: "checkmark.shield.fill", tint: .green
              ) { verifyPhone() }
              .disabled(phoneVerificationCode.isEmpty)
            }
          }
          EchoDetailSection(title: "Sign-in security") {
            EchoSettingAction(
              title: "Change password", subtitle: "Update the password used for Echo sign-in",
              icon: "key.fill", tint: .orange
            ) { showPasswordSheet = true }
            EchoSettingAction(
              title: accountState.totpEnabled
                ? "Manage two-factor authentication" : "Set up two-factor authentication",
              subtitle: accountState.totpEnabled
                ? "Authenticator protection is enabled" : "Add another layer of account security",
              icon: "lock.shield.fill", tint: .green
            ) { showTotpSheet = true }
            if accountState.totpEnabled {
              EchoSettingAction(
                title: "Disable two-factor authentication",
                subtitle: "Remove authenticator protection",
                icon: "lock.open.fill", tint: .red, role: .destructive
              ) { showDisableTotp = true }
            }
            ForEach(passkeys) { passkey in
              EchoPasskeyRow(
                passkey: passkey,
                onRename: {
                  passkeyToRename = passkey
                  passkeyRenameLabel = passkey.label
                },
                onRemove: { revokePasskey(passkey) })
            }
            EchoSettingAction(
              title: "Add passkey", subtitle: "Use Face ID or Touch ID for faster sign-in",
              icon: "person.badge.key.fill", tint: .purple
            ) { showPasskeyRegistration = true }
          }
          EchoDetailSection(title: "Active sessions") {
            ForEach(sessions) { session in
              EchoSessionRow(session: session) { revokeSession(session) }
            }
            EchoSettingAction(
              title: "Sign out all other sessions", subtitle: "Keep this device signed in",
              icon: "rectangle.portrait.and.arrow.right", tint: .orange
            ) { signOutOtherSessions() }
          }
          EchoDetailSection(title: "Danger zone") {
            EchoSettingAction(
              title: "Delete Echo account", subtitle: "Permanently remove your account and data",
              icon: "trash.fill", tint: .red, role: .destructive
            ) { showDeleteConfirmation = true }
          }
        case .dataPrivacy:
          EchoDetailSection(title: "Data Rights") {
            Button {
              exportAccountData()
            } label: {
              HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                  Text("Download all my data")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                  Text(
                    "Exports your account, sessions, friends, blocks, and DM metadata as JSON."
                  )
                  .font(.system(size: 12, design: .rounded))
                  .foregroundStyle(.white.opacity(0.48))
                  .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Text(isExportingData ? "Preparing…" : "Export")
                  .font(.system(size: 12, weight: .semibold, design: .rounded))
                  .foregroundStyle(.white.opacity(isExportingData ? 0.42 : 0.72))
              }
              .padding(.vertical, 4)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isExportingData)
            .accessibilityHint("Prepares a JSON export of your Echo account data")

            Text("Friend and DM request preferences are under Friends.")
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.white.opacity(0.42))
              .padding(.top, 4)
          }
        case .advanced:
          EchoDetailSection(title: "Developer") {
            EchoSettingToggle(
              title: "Developer Mode",
              subtitle: "Show internal Echo IDs and developer tools on this device only",
              icon: "hammer.fill", tint: .purple, isOn: $developerModeEnabled)
            EchoSettingToggle(
              title: "Bug Hunter",
              subtitle: "Record detailed technical activity for troubleshooting on this device",
              icon: "ladybug.fill", tint: .orange, isOn: $bugHunterEnabled)
            EchoSettingToggle(
              title: "Verbose diagnostics",
              subtitle: "Capture extra information for troubleshooting",
              icon: "stethoscope.fill", tint: .gray, isOn: $diagnosticsEnabled)
            Text(
              "Developer Mode and Bug Hunter are device-only options. Bug Hunter keeps a bounded, privacy-safe trace in memory and clears it when disabled."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        case .discord, .google, .youtube:
          EchoDetailSection(title: "Connected apps") {
            if let externalLinkStatus {
              Label(
                externalLinkStatus ? "Connected to Echo" : "Not connected",
                systemImage: externalLinkStatus ? "checkmark.circle.fill" : "circle"
              )
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(externalLinkStatus ? .green : .secondary)
            }
            if route == .google, externalLinkStatus == true {
              EchoSettingAction(
                title: isDisconnectingExternalLink ? "Disconnecting…" : "Disconnect Google",
                subtitle: "Remove Google sign-in and linked access",
                icon: "xmark.circle.fill", tint: .red, role: .destructive
              ) { disconnectGoogle() }
              .disabled(isDisconnectingExternalLink)
            } else {
              EchoSettingAction(
                title: linkingProvider == title.lowercased()
                  ? "Opening secure sign-in…"
                  : externalLinkStatus == true ? "Manage \(title) link" : "Connect \(title)",
                subtitle: externalLinkStatus == true
                  ? "Review the connected account in a secure browser"
                  : "Authorize securely and return to Echo",
                icon: icon, tint: tint
              ) { startExternalLink(title.lowercased()) }
              .disabled(linkingProvider != nil)
            }
            Text(
              route == .discord && externalLinkStatus == true
                ? "Discord unlinking is managed by Echo support."
                : "You will complete authorization in Apple’s secure browser session and return to Echo when finished."
            ).font(.footnote).foregroundStyle(.secondary)
          }
        case .echoPlus, .subscriptions:
          EchoMembershipSettingsView(accessToken: accessToken, baseURL: baseURL)
        case .termsPolicies:
          EchoLegalSettingsView()
        case .formattingGuide:
          EchoFormattingGuideView()
        case .reportAbuse:
          EchoReportAbuseView(accessToken: accessToken, baseURL: baseURL)
        }
      }
      .padding(.horizontal, 16)
      // Keep content clear of the navigation bar while letting the system own
      // the safe area and title placement.
      .padding(.bottom, 28)
    }
    .safeAreaPadding(.top, 34)
    .navigationTitle("")
    .navigationBarBackButtonHidden(true)
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
    .background(EchoSettingsBackdrop().ignoresSafeArea())
    .task { await loadRemoteState() }
    .onChange(of: notificationSettings) { _, _ in
      guard route == .notifications || route == .sounds else { return }
      saveNotifications()
    }
    .onDisappear {
      pendingNotificationSave?.cancel()
    }
    .sheet(isPresented: $showDeleteConfirmation) {
      EchoDeleteAccountSheet(password: $deletePassword, totpCode: $deleteTotpCode) {
        deleteAccount()
        showDeleteConfirmation = false
      }
    }
    .fileExporter(
      isPresented: $showExportExporter,
      document: exportDocument,
      contentType: .json,
      defaultFilename: exportFilename
    ) { result in
      exportDocument = nil
      if case .failure(let error) = result {
        errorMessage = error.localizedDescription
      }
    }
    .sheet(
      isPresented: Binding(
        get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    ) {
      EchoSettingsErrorSheet(message: errorMessage ?? "") {
        errorMessage = nil
      }
    }
    .sheet(isPresented: $showPasswordSheet) {
      EchoPasswordChangeSheet(
        baseURL: baseURL, accessToken: accessToken, onPasswordChanged: onSignOut)
    }
    .sheet(isPresented: $showTotpSheet) {
      EchoTotpSetupSheet(baseURL: baseURL, accessToken: accessToken)
    }
    .sheet(isPresented: $showEmailEditor) {
      EchoAccountFieldSheet(
        title: "Email address", prompt: "you@example.com", value: $accountState.email,
        keyboard: .emailAddress
      ) { saveIdentity() }
    }
    .sheet(isPresented: $showUsernameEditor) {
      EchoAccountFieldSheet(
        title: "Username", prompt: "username", value: $accountState.username,
        keyboard: .username
      ) { saveUsername() }
    }
    .sheet(isPresented: $showPhoneEditor) {
      EchoAccountFieldSheet(
        title: "Phone number", prompt: "+1 555 123 4567", value: $accountState.phone,
        keyboard: .phonePad
      ) { saveIdentity() }
    }
    .sheet(isPresented: $showPhoneCodeSheet) {
      EchoAccountFieldSheet(
        title: "Verification code", prompt: "000000", value: $phoneVerificationCode,
        keyboard: .numberPad
      ) { verifyPhone() }
    }
    .sheet(isPresented: $showPasskeyRegistration) {
      EchoPasskeyRegistrationSheet(baseURL: baseURL, accessToken: accessToken) {
        Task {
          passkeys =
            (try? await settingsClient.loadPasskeys(accessToken: accessToken))
            ?? passkeys
        }
      }
    }
    .sheet(
      isPresented: Binding(
        get: { passkeyToRename != nil }, set: { if !$0 { passkeyToRename = nil } })
    ) {
      EchoPasskeyRenameSheet(label: $passkeyRenameLabel) {
        renamePasskey()
        passkeyToRename = nil
      }
    }
    .sheet(isPresented: $showDisableTotp) {
      EchoDisableTotpSheet(
        password: $totpPassword, code: $totpCode, recoveryCode: $totpRecoveryCode
      ) {
        disableTotp()
        showDisableTotp = false
      }
    }
  }

  private func soundBinding(_ key: String) -> Binding<Bool> {
    Binding(
      get: { notificationSettings.soundEffectsById[key] ?? true },
      set: { notificationSettings.soundEffectsById[key] = $0 })
  }

  private var systemNotificationSubtitle: String {
    switch systemNotificationsAuthorized {
    case .some(true): "Allowed by (notificationPlatformName) notification settings"
    case .some(false): "Blocked by (notificationPlatformName); open permissions to enable alerts"
    case .none: "Checking (notificationPlatformName) notification permissions…"
    }
  }

  private var notificationPlatformName: String {
    #if os(iOS)
      "iPhone"
    #else
      "Mac"
    #endif
  }

  private func refreshSystemNotificationAuthorization() async {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    systemNotificationsAuthorized = echoNotificationsAuthorized(settings.authorizationStatus)
  }

  private func requestSystemNotificationPermission() {
    Task {
      do {
        let granted = try await EchoPushRegistration.shared.requestAuthorizationAndRegister()
        await refreshSystemNotificationAuthorization()
        if !granted {
          errorMessage =
            "Echo notifications are disabled in (notificationPlatformName) System Settings."
        }
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func sendTestNotification() {
    Task {
      do {
        try await EchoPushRegistration.shared.sendTestNotification()
        await refreshSystemNotificationAuthorization()
      } catch {
        await refreshSystemNotificationAuthorization()
        errorMessage = error.localizedDescription
      }
    }
  }

  private func saveNotifications() {
    pendingNotificationSave?.cancel()
    guard notificationPreferencesLoaded else { return }
    let settings = notificationSettings
    guard settings != lastPersistedNotificationSettings else { return }
    pendingNotificationSave = Task {
      do {
        try await Task.sleep(for: .milliseconds(450))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      do {
        // A short retry absorbs transient gateway/database failures while the
        // user is rapidly moving a slider or tapping sound cards.
        var lastError: Error?
        for attempt in 0..<2 {
          do {
            try await settingsClient.saveNotificationPreferences(
              settings, accessToken: accessToken)
            lastError = nil
            break
          } catch {
            lastError = error
            if attempt == 0 { try? await Task.sleep(for: .milliseconds(250)) }
          }
        }
        if let lastError { throw lastError }
        lastPersistedNotificationSettings = settings
      } catch is CancellationError {
        // A newer slider/toggle change superseded this save.
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }
  private func updateAccount(_ settings: [String: Bool]) {
    Task {
      do {
        try await settingsClient.updateAccountPreferences(
          settings, accessToken: accessToken)
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func updateLocaleAndTimeZone(locale: String, timeZone: String?) {
    guard ["en-US", "en-GB"].contains(locale) else { return }
    Task {
      do {
        try await settingsClient.updateLocaleAndTimeZone(
          locale: locale, timeZone: timeZone, accessToken: accessToken)
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func loadRemoteState() async {
    let client = settingsClient
    if route == .timeLanguage { isLoadingTimeLanguage = true }
    if route == .friends { isLoadingAccountPreferences = true }
    defer {
      isLoadingTimeLanguage = false
      isLoadingAccountPreferences = false
    }
    if route == .notifications || route == .sounds {
      notificationPreferencesLoaded = false
      do {
        notificationSettings = try await client.loadNotificationPreferences(
          accessToken: accessToken)
        lastPersistedNotificationSettings = notificationSettings
      } catch {
        errorMessage = error.localizedDescription
      }
      notificationPreferencesLoaded = true
      await refreshSystemNotificationAuthorization()
    }
    if route == .friends {
      do {
        async let friends = client.loadFriends(accessToken: accessToken)
        async let requests = client.loadFriendRequests(accessToken: accessToken)
        friendCount = try await friends.count
        incomingRequestCount = try await requests.incoming.count
      } catch {
        errorMessage = error.localizedDescription
      }
    }
    if route == .account || route == .friends || route == .timeLanguage
      || route == .dataPrivacy
    {
      do {
        let identity = try await client.loadAccountIdentity(accessToken: accessToken)
        accountState.apply(identity)
        if route == .timeLanguage {
          if let value = identity.locale, ["en-US", "en-GB"].contains(value) {
            localeIdentifier = value
          }
          if let value = identity.timeZone, TimeZone(identifier: value) != nil {
            timezoneIdentifier = value
          }
        }
      } catch {
        errorMessage = error.localizedDescription
      }
      if route == .account {
        do {
          async let loadedSessions = client.loadSessions(accessToken: accessToken)
          async let loadedPasskeys = client.loadPasskeys(accessToken: accessToken)
          sessions = try await loadedSessions
          passkeys = try await loadedPasskeys
        } catch {
          errorMessage = error.localizedDescription
        }
      }
    }
    if route == .discord || route == .google {
      do {
        externalLinkStatus = try await client.loadExternalLinkStatus(
          title.lowercased(), accessToken: accessToken)
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func saveIdentity() {
    Task {
      do {
        try await settingsClient.updateIdentity(
          email: accountState.email,
          phone: accountState.phone.isEmpty ? nil : accountState.phone,
          accessToken: accessToken)
      } catch { errorMessage = error.localizedDescription }
    }
  }

  private func saveUsername() {
    let rawUsername = accountState.username.trimmingCharacters(in: .whitespacesAndNewlines)
    let username = rawUsername.hasPrefix("@") ? String(rawUsername.dropFirst()) : rawUsername
    guard !username.isEmpty else { return }
    accountState.username = username
    Task {
      do {
        try await settingsClient.updateProfile(
          displayName: nil, username: username, bio: nil, customStatus: nil,
          bannerImage: nil, avatarImage: nil, accessToken: accessToken)
      } catch { errorMessage = error.localizedDescription }
    }
  }

  private func disableTotp() {
    Task {
      do {
        try await settingsClient.disableTotp(
          password: totpPassword, code: totpCode.isEmpty ? nil : totpCode,
          recoveryCode: totpRecoveryCode.isEmpty ? nil : totpRecoveryCode, accessToken: accessToken)
        accountState.totpEnabled = false
      } catch { errorMessage = error.localizedDescription }
    }
  }
  private func startExternalLink(_ provider: String) {
    linkingProvider = provider
    Task {
      do {
        let url = try await settingsClient.startExternalLink(
          provider, accessToken: accessToken)
        guard EchoSettingsClient.isAllowedExternalAuthorizeURL(url, apiBaseURL: baseURL) else {
          errorMessage = "Echo blocked an unexpected authorize URL."
          linkingProvider = nil
          return
        }
        openURL(url)
      } catch { errorMessage = error.localizedDescription }
      linkingProvider = nil
    }
  }

  private func disconnectGoogle() {
    isDisconnectingExternalLink = true
    Task {
      do {
        try await settingsClient.disconnectGoogle(accessToken: accessToken)
        externalLinkStatus = false
      } catch {
        errorMessage = error.localizedDescription
      }
      isDisconnectingExternalLink = false
    }
  }
  private func resendEmailVerification() {
    Task {
      do {
        try await settingsClient.resendEmailVerification(
          accessToken: accessToken)
      } catch { errorMessage = error.localizedDescription }
    }
  }
  private func sendPhoneCode() {
    Task {
      do {
        try await settingsClient.sendPhoneVerificationCode(
          accessToken: accessToken)
      } catch { errorMessage = error.localizedDescription }
    }
  }
  private func verifyPhone() {
    Task {
      do {
        try await settingsClient.verifyPhone(
          code: phoneVerificationCode, accessToken: accessToken)
        accountState.phoneVerified = true
      } catch { errorMessage = error.localizedDescription }
    }
  }

  private func soundVolumeBinding(_ key: String) -> Binding<Double> {
    Binding(
      get: { (notificationSettings.soundEffectsVolumeById[key] ?? 100) / 100 },
      set: { notificationSettings.soundEffectsVolumeById[key] = $0 * 100 })
  }

  private func revokeSession(_ session: EchoAuthSession) {
    Task {
      do {
        try await settingsClient.revokeSessions(
          session.sessionIDs, accessToken: accessToken)
        sessions.removeAll { $0.id == session.id }
      } catch {
        sessions =
          (try? await settingsClient.loadSessions(accessToken: accessToken))
          ?? sessions
        errorMessage = error.localizedDescription
      }
    }
  }
  private func signOutOtherSessions() {
    Task {
      do {
        let otherIDs = sessions
          .filter { $0.isCurrentSession != true }
          .flatMap(\.sessionIDs)
        if !otherIDs.isEmpty {
          try await settingsClient.revokeSessions(otherIDs, accessToken: accessToken)
        }
        sessions =
          (try? await settingsClient.loadSessions(accessToken: accessToken))
          ?? []
      } catch { errorMessage = error.localizedDescription }
    }
  }
  private func revokePasskey(_ passkey: EchoPasskeyCredential) {
    Task {
      do {
        try await settingsClient.revokePasskey(
          passkey.id, accessToken: accessToken)
        passkeys.removeAll { $0.id == passkey.id }
      } catch { errorMessage = error.localizedDescription }
    }
  }
  private func renamePasskey() {
    guard let passkey = passkeyToRename,
      !passkeyRenameLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    Task {
      do {
        try await settingsClient.renamePasskey(
          passkey.id, label: passkeyRenameLabel, accessToken: accessToken)
        passkeys =
          (try? await settingsClient.loadPasskeys(accessToken: accessToken))
          ?? passkeys
      } catch { errorMessage = error.localizedDescription }
      passkeyToRename = nil
    }
  }
  private func exportAccountData() {
    guard !isExportingData else { return }
    isExportingData = true
    Task {
      defer { isExportingData = false }
      do {
        let data = try await settingsClient.exportAccountData(accessToken: accessToken)
        let username =
          accountState.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          ? "echo-user" : accountState.username
        let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
        exportFilename = "echo-data-export-\(username)-\(date).json"
        exportDocument = EchoDataExportDocument(data: data)
        showExportExporter = true
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }
  private func deleteAccount() {
    Task {
      do {
        try await settingsClient.deleteAccount(
          password: deletePassword.isEmpty ? nil : deletePassword,
          totpCode: deleteTotpCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? nil : deleteTotpCode.trimmingCharacters(in: .whitespacesAndNewlines),
          accessToken: accessToken)
        errorMessage = "Account deleted. Please sign out."
        onSignOut()
      } catch { errorMessage = error.localizedDescription }
    }
  }

  private var detailDescription: String {
    switch route {
    case .notifications: "Alerts, badges, and mentions"
    case .sounds: "Audio feedback and volume"
    case .style: "Motion and visual preferences"
    case .accessibility: "Readability and interaction"
    case .timeLanguage: "Formatting and locale"
    case .dataPrivacy: "Export your account data. Friend preferences are under Friends."
    default: "Echo account and app controls"
    }
  }
}

private enum EchoAccountKeyboard {
  case username
  case emailAddress
  case phonePad
  case numberPad
}

private func obfuscatedEmail(_ email: String) -> String {
  let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let at = value.firstIndex(of: "@"), at > value.startIndex else {
    return value.isEmpty ? "Not set" : "•••"
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

private struct EchoAccountFieldSheet: View {
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
            title: title, description: "Keep your Echo account details up to date.",
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
            title: "Save \(title.lowercased())", subtitle: "Apply this change to your Echo account",
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
          Button("Cancel") { dismiss() }
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

private struct EchoSettingMetric: View {
  let title: String
  let value: Int
  let icon: String
  let tint: Color

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 36, height: 36)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
      Text(title)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
      Spacer()
      Text("\(value)")
        .font(.system(size: 17, weight: .bold, design: .rounded))
        .foregroundStyle(tint)
        .monospacedDigit()
    }
  }
}

private struct EchoSettingChoice: View {
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var value: String
  let options: [(String, String)]
  @State private var isPresented = false

  private var selectedLabel: String {
    options.first(where: { $0.0 == value })?.1 ?? value
  }

  var body: some View {
    Button {
      isPresented = true
    } label: {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 36, height: 36)
          .background(
            tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(title)
            .font(.system(size: 15, weight: .semibold, design: .rounded))
          Text(subtitle)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.secondary)
        }
        Spacer(minLength: 8)
        HStack(spacing: 5) {
          Text(selectedLabel)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .lineLimit(1)
          Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.secondary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .sheet(isPresented: $isPresented) {
      EchoChoiceSheet(
        title: title, subtitle: subtitle, icon: icon, tint: tint, value: $value, options: options)
    }
  }
}

private struct EchoChoiceSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var searchText = ""
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var value: String
  let options: [(String, String)]

  private var filteredOptions: [(String, String)] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return options }
    return options.filter {
      $0.0.localizedCaseInsensitiveContains(query)
        || $0.1.localizedCaseInsensitiveContains(query)
    }
  }

  var body: some View {
    EchoSettingsSheetShell(
      title: title, description: subtitle, icon: icon, tint: tint, onCancel: { dismiss() },
      content: {
        VStack(spacing: 10) {
          if options.count > 100 {
            HStack(spacing: 9) {
              Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
              TextField("Search (title.lowercased())", text: $searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(.white)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 46)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
          }
          ForEach(filteredOptions, id: \.0) { option in
            Button {
              value = option.0
              dismiss()
            } label: {
              HStack(spacing: 12) {
                Circle()
                  .fill(option.0 == value ? tint : .white.opacity(0.12))
                  .frame(width: 12, height: 12)
                  .overlay {
                    if option.0 == value {
                      Circle().stroke(.white.opacity(0.9), lineWidth: 2).padding(3)
                    }
                  }
                Text(option.1)
                  .font(.system(size: 16, weight: .semibold, design: .rounded))
                  .foregroundStyle(.white.opacity(0.92))
                Spacer()
                if option.0 == value {
                  Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(tint)
                }
              }
              .padding(.horizontal, 15)
              .frame(minHeight: 54)
              .background(
                option.0 == value ? tint.opacity(0.13) : .white.opacity(0.06),
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                  .stroke(
                    option.0 == value ? tint.opacity(0.42) : .white.opacity(0.10), lineWidth: 1)
              }
            }
            .buttonStyle(.plain)
          }
        }
      })
  }
}

private struct EchoDeleteAccountSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var password: String
  @Binding var totpCode: String
  let onDelete: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: "Delete Echo account",
      description: "This permanently removes your account and associated data.",
      icon: "trash.fill", tint: .red, onCancel: { dismiss() },
      content: {
        VStack(alignment: .leading, spacing: 10) {
          Label("This cannot be undone", systemImage: "exclamationmark.triangle.fill")
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(.red)
          Text(
            "Enter your password if your account requires one, plus an authenticator code when 2FA is enabled, then confirm deletion."
          )
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
          title: "Password (if required)", icon: "lock.fill", tint: .red,
          value: $password, isSecure: true)
        EchoSettingsSheetField(
          title: "Authenticator code (if enabled)", icon: "lock.shield.fill", tint: .orange,
          value: $totpCode, keyboard: .numberPad)
        EchoSettingAction(
          title: "Delete permanently", subtitle: "Remove Echo account and data",
          icon: "trash.fill", tint: .red, role: .destructive
        ) {
          onDelete()
          dismiss()
        }
      })
  }
}

private struct EchoSettingsErrorSheet: View {
  @Environment(\.dismiss) private var dismiss
  let message: String
  let onDismiss: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: "Couldn’t complete that",
      description: "Echo ran into a problem while saving this setting.",
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
          title: "Dismiss", subtitle: "Return to your Echo settings",
          icon: "xmark.circle.fill", tint: .orange
        ) {
          onDismiss()
          dismiss()
        }
      })
  }
}

private struct EchoPasskeyRenameSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var label: String
  let onSave: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: "Rename passkey", description: "Give this secure sign-in a name you recognize.",
      icon: "pencil", tint: .purple, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: "Passkey name", icon: "tag.fill", tint: .purple, value: $label)
        EchoSettingAction(
          title: "Save name", subtitle: "Update this passkey on Echo",
          icon: "checkmark.circle.fill", tint: .purple
        ) {
          onSave()
          dismiss()
        }
        .disabled(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      })
  }
}

private struct EchoDisableTotpSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var password: String
  @Binding var code: String
  @Binding var recoveryCode: String
  let onDisable: () -> Void

  var body: some View {
    EchoSettingsSheetShell(
      title: "Disable two-factor authentication",
      description: "Confirm your identity before removing authenticator protection.",
      icon: "lock.open.fill", tint: .red, onCancel: { dismiss() },
      content: {
        EchoSettingsSheetField(
          title: "Current password", icon: "lock.fill", tint: .orange,
          value: $password, isSecure: true)
        EchoSettingsSheetField(
          title: "Authenticator code", icon: "number.square.fill", tint: .blue,
          value: $code, keyboard: .numberPad)
        EchoSettingsSheetField(
          title: "Recovery code (alternative)", icon: "lifepreserver.fill", tint: .purple,
          value: $recoveryCode)
        EchoSettingAction(
          title: "Disable two-factor authentication",
          subtitle: "Remove authenticator protection from this account",
          icon: "lock.open.fill", tint: .red, role: .destructive
        ) {
          onDisable()
          dismiss()
        }
      })
  }
}
