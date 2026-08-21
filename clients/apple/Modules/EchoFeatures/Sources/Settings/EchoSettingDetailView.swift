import EchoNetworking
import SwiftUI

struct EchoSettingDetailView: View {
  @Environment(\.dismiss) var dismiss
  @Environment(\.openURL) var openURL
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
  @AppStorage("echo.settings.locale") private var localeIdentifier = "en-US"
  @AppStorage("echo.settings.timezone") private var timezoneIdentifier = "system"
  // These controls intentionally remain device-local, matching the web client's
  // developer settings store. They never leave the device or alter account state.
  @AppStorage("echo.settings.advanced.developerMode") private var developerModeEnabled = false
  @AppStorage("echo.settings.advanced.bugHunter") private var bugHunterEnabled = false
  @AppStorage("echo.settings.advanced.diagnostics") private var diagnosticsEnabled = false
  @State var model: EchoSettingDetailModel
  @State var showDeleteConfirmation = false
  @State var showPasswordSheet = false
  @State var showTotpSheet = false
  @State var showEmailEditor = false
  @State var showUsernameEditor = false
  @State var showPhoneEditor = false
  @State var showPhoneCodeSheet = false
  @State var showDisableTotp = false
  @State var showPasskeyRegistration = false

  init(
    route: EchoSettingsRoute,
    icon: String,
    tint: Color,
    baseURL: URL,
    accessToken: String,
    onSignOut: @escaping () -> Void,
    client: EchoSettingsClient? = nil
  ) {
    self.route = route
    self.icon = icon
    self.tint = tint
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onSignOut = onSignOut
    _model = State(
      initialValue: EchoSettingDetailModel(
        route: route,
        baseURL: baseURL,
        accessToken: accessToken,
        onSignOut: onSignOut,
        client: client
      ))
  }

  var title: String { route.title }

  var body: some View {
    @Bindable var model = model
    ScrollView(.vertical, showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 14) {
        EchoSettingDetailHeader(
          title: title, description: model.detailDescription, icon: icon, tint: tint,
          onBack: { dismiss() })
        switch route {
        case .notifications:
          EchoDetailSection(title: EchoCopy.string("Message alerts")) {
            EchoSettingToggle(
              title: EchoCopy.string("Allow Echo notifications"),
              subtitle: model.systemNotificationSubtitle,
              icon: "bell.fill", tint: .orange, isOn: $model.notificationSettings.desktopAlerts
            )
            .onChange(of: model.notificationSettings.desktopAlerts) { _, isEnabled in
              if isEnabled { model.requestSystemNotificationPermission() }
            }
            EchoSettingToggle(
              title: EchoCopy.string("Unread badges"),
              subtitle: EchoCopy.string("Show unread counts on Echo"), icon: "app.badge",
              tint: .pink, isOn: $model.notificationSettings.unreadBadge)
            EchoSettingToggle(
              title: EchoCopy.string("Mention highlights"),
              subtitle: EchoCopy.string("Make mentions stand out in conversations"),
              icon: "at", tint: .purple, isOn: $model.notificationSettings.mentionHighlights)
            EchoSettingAction(
              title: EchoCopy.format(
                "Manage %@ notification permissions", model.notificationPlatformName),
              subtitle: EchoCopy.string("Open System Settings for Echo alerts"),
              icon: "gearshape.fill",
              tint: .orange
            ) {
              EchoPushRegistration.shared.openSystemNotificationSettings()
            }
            EchoSettingAction(
              title: EchoCopy.string("Send a test notification"),
              subtitle: EchoCopy.string("Deliver a real local alert in one second"),
              icon: "paperplane.fill", tint: .blue
            ) {
              model.sendTestNotification()
            }
            Label(
              EchoCopy.string("Echo follows your system notification permissions."),
              systemImage: "info.circle"
            )
            .font(.footnote).foregroundStyle(.secondary)
          }
        case .sounds:
          EchoSoundsMasterControls(
            soundEffectsEnabled: $model.notificationSettings.soundEffects,
            masterVolume: $model.notificationSettings.soundEffectsMasterVolume)
          ForEach(EchoSoundGroup.allCases) { group in
            EchoDetailSection(title: group.title) {
              LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                spacing: 10
              ) {
                ForEach(EchoSoundOption.allCases.filter { $0.group == group }) { sound in
                  EchoSoundWidget(
                    sound: sound,
                    isEnabled: model.soundBinding(sound.id),
                    volume: model.soundVolumeBinding(sound.id),
                    masterVolume: model.notificationSettings.soundEffectsMasterVolume,
                    soundEffectsEnabled: model.notificationSettings.soundEffects)
                }
              }
              .opacity(model.notificationSettings.soundEffects ? 1 : 0.45)
              .allowsHitTesting(model.notificationSettings.soundEffects)
            }
          }
        case .style:
          EchoDetailSection(title: EchoCopy.string("Motion")) {
            EchoSettingChoice(
              title: EchoCopy.string("Theme"), subtitle: EchoCopy.string("Choose how Echo looks"),
              icon: "circle.lefthalf.filled",
              tint: .indigo, value: $theme,
              options: [("dark", "Dark"), ("light", "Light"), ("system", "System")])
            EchoSettingChoice(
              title: EchoCopy.string("Density"),
              subtitle: EchoCopy.string("Control spacing across the app"),
              icon: "rectangle.compress.vertical",
              tint: .cyan, value: $density,
              options: [
                ("compact", "Compact"), ("comfortable", "Comfortable"), ("spacious", "Spacious"),
              ])
            EchoSettingChoice(
              title: EchoCopy.string("Action rail"),
              subtitle: EchoCopy.string("Choose where actions appear"), icon: "sidebar.left",
              tint: .purple, value: $actionRail,
              options: [("left", "Left"), ("top", "Top")])
            EchoSettingSlider(
              title: EchoCopy.string("Text scale"), icon: "textformat.size", tint: .cyan,
              value: $fontScale,
              range: 85...130, valueScale: 1.0)
            EchoSettingToggle(
              title: EchoCopy.string("Reduce motion"),
              subtitle: EchoCopy.string("Use gentler transitions across Echo"),
              icon: "figure.walk.motion", tint: .green, isOn: $reduceMotion)
            EchoSettingToggle(
              title: EchoCopy.string("Sync with system appearance"),
              subtitle: EchoCopy.string("Follow iPhone Light and Dark Mode"),
              icon: "circle.lefthalf.filled", tint: .indigo, isOn: $syncTheme)
            EchoSettingToggle(
              title: EchoCopy.string("Saturate accent colors"),
              subtitle: EchoCopy.string("Make Echo colors more vivid"),
              icon: "paintpalette.fill", tint: .purple, isOn: $saturateAccents)
            EchoCopy.text(
              "Echo follows your system appearance and keeps its dark-first visual language."
            )
            .font(.footnote).foregroundStyle(.secondary)
          }
        case .accessibility:
          EchoDetailSection(title: EchoCopy.string("Readability")) {
            EchoSettingToggle(
              title: EchoCopy.string("Larger text"),
              subtitle: EchoCopy.string("Increase text size throughout Echo"),
              icon: "textformat.size.larger", tint: .green, isOn: $largerText)
            EchoSettingToggle(
              title: EchoCopy.string("High contrast"),
              subtitle: EchoCopy.string("Increase separation between surfaces and text"),
              icon: "circle.lefthalf.filled.inverse", tint: .orange, isOn: $highContrast)
            EchoSettingToggle(
              title: EchoCopy.string("Message spacing"),
              subtitle: EchoCopy.string("Give conversations more breathing room"),
              icon: "arrow.up.and.down.text.horizontal", tint: .blue, isOn: $showMessageSpacing)
            EchoSettingToggle(
              title: EchoCopy.string("Dyslexia-friendly font"),
              subtitle: EchoCopy.string("Use a more readable typeface"),
              icon: "textformat.abc", tint: .purple, isOn: $dyslexiaFont)
            EchoSettingToggle(
              title: EchoCopy.string("Solid glass surfaces"),
              subtitle: EchoCopy.string("Reduce translucency for clearer panels"),
              icon: "square.fill", tint: .cyan, isOn: $solidGlass)
            EchoCopy.text("Echo uses Dynamic Type throughout native settings.").font(.footnote)
              .foregroundStyle(.secondary)
          }
        case .timeLanguage:
          EchoDetailSection(title: EchoCopy.string("Time format")) {
            EchoSettingToggle(
              title: EchoCopy.string("24-hour time"),
              subtitle: EchoCopy.string("Use a 24-hour clock throughout Echo"),
              icon: "clock.fill", tint: .mint, isOn: $uses24HourTime)
            EchoSettingChoice(
              title: EchoCopy.string("Language"),
              subtitle: EchoCopy.string("Choose Echo’s display language"),
              icon: "character.book.closed.fill",
              tint: .blue, value: $localeIdentifier,
              options: EchoLocaleOptions.languages
            )
            .onChange(of: localeIdentifier) { _, value in
              guard !model.isLoadingTimeLanguage else { return }
              model.updateLocaleAndTimeZone(
                locale: value, timeZone: timezoneIdentifier == "system" ? nil : timezoneIdentifier)
            }
            EchoSettingChoice(
              title: EchoCopy.string("Time zone"),
              subtitle: EchoCopy.string("Choose how timestamps are localized"), icon: "globe",
              tint: .orange, value: $timezoneIdentifier,
              options: EchoLocaleOptions.timeZones
            )
            .onChange(of: timezoneIdentifier) { _, value in
              guard !model.isLoadingTimeLanguage else { return }
              model.updateLocaleAndTimeZone(
                locale: localeIdentifier, timeZone: value == "system" ? nil : value)
            }
          }
        case .voiceVideo:
          EchoDetailSection(title: EchoCopy.string("Voice processing")) {
            EchoSettingChoice(
              title: EchoCopy.string("Input device"),
              subtitle: EchoCopy.string("Choose the microphone Echo uses"), icon: "mic.fill",
              tint: .blue, value: $inputDevice,
              options: [("default", "System default"), ("built-in-mic", "Built-in microphone")])
            EchoSettingChoice(
              title: EchoCopy.string("Output device"),
              subtitle: EchoCopy.string("Choose where Echo plays audio"),
              icon: "speaker.wave.2.fill",
              tint: .purple, value: $outputDevice,
              options: [("default", "System default"), ("built-in-speaker", "Built-in speaker")])
            EchoSettingToggle(
              title: EchoCopy.string("Echo cancellation"),
              subtitle: EchoCopy.string("Reduce feedback while you speak"),
              icon: "waveform.path.ecg", tint: .green, isOn: $echoCancellation)
            EchoSettingToggle(
              title: EchoCopy.string("Noise suppression"),
              subtitle: EchoCopy.string("Keep background noise out of calls"),
              icon: "waveform.badge.magnifyingglass", tint: .orange, isOn: $noiseSuppression)
            EchoSettingToggle(
              title: EchoCopy.string("Automatic gain control"),
              subtitle: EchoCopy.string("Keep your voice at a steady level"),
              icon: "dial.medium.fill", tint: .cyan, isOn: $automaticGainControl)
            EchoSettingSlider(
              title: EchoCopy.string("Input sensitivity"), icon: "mic", tint: .blue,
              value: $inputSensitivity,
              range: 0...100)
            EchoSettingSlider(
              title: EchoCopy.string("Output volume"), icon: "speaker.wave.2", tint: .purple,
              value: $outputVolume,
              range: 0...100)
          }
          EchoDetailSection(title: EchoCopy.string("Camera")) {
            EchoSettingChoice(
              title: EchoCopy.string("Camera"),
              subtitle: EchoCopy.string("Choose the camera Echo uses"), icon: "camera.fill",
              tint: .red, value: $cameraDevice,
              options: [("default", "System default"), ("built-in-camera", "Built-in camera")])
            EchoSettingChoice(
              title: EchoCopy.string("Video quality"),
              subtitle: EchoCopy.string("Balance clarity and bandwidth"),
              icon: "rectangle.inset.filled.and.person.filled",
              tint: .pink, value: $videoQuality,
              options: [("720p", "720p (HD)"), ("480p", "480p (SD)"), ("360p", "360p")])
          }
        case .friends:
          EchoDetailSection(title: EchoCopy.string("Privacy")) {
            EchoSettingToggle(
              title: EchoCopy.string("Allow friend requests"),
              subtitle: EchoCopy.string("Let people send you friend requests"),
              icon: "person.badge.plus", tint: .blue, isOn: $model.accountState.friendsAllowed
            )
            .onChange(of: model.accountState.friendsAllowed) { _, value in
              guard !model.isLoadingAccountPreferences else { return }
              model.updateAccount(["allowFriendRequests": value])
            }
            EchoSettingToggle(
              title: EchoCopy.string("Allow message requests"),
              subtitle: EchoCopy.string("Receive messages from new contacts"),
              icon: "bubble.left.and.bubble.right.fill", tint: .indigo,
              isOn: $model.accountState.messagesAllowed
            )
            .onChange(of: model.accountState.messagesAllowed) { _, value in
              guard !model.isLoadingAccountPreferences else { return }
              model.updateAccount(["allowMessageRequests": value])
            }
            EchoSettingToggle(
              title: EchoCopy.string("Show last online"),
              subtitle: EchoCopy.string("Let friends see when you were last active"),
              icon: "clock.fill", tint: .mint, isOn: $model.accountState.showLastOnline
            )
            .onChange(of: model.accountState.showLastOnline) { _, value in
              guard !model.isLoadingAccountPreferences else { return }
              model.updateAccount(["showLastOnline": value])
            }
            EchoSettingMetric(
              title: EchoCopy.string("Friends"), value: model.friendCount, icon: "person.2.fill",
              tint: .blue)
            EchoSettingMetric(
              title: EchoCopy.string("Incoming requests"), value: model.incomingRequestCount,
              icon: "tray.and.arrow.down.fill",
              tint: .purple)
          }
        case .account:
          accountSections(model: model)
        case .dataPrivacy:
          EchoDetailSection(title: EchoCopy.string("Data Rights")) {
            Button {
              model.exportAccountData()
            } label: {
              HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                  EchoCopy.text("Download all my data")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                  EchoCopy.text(
                    "Exports your account, sessions, friends, blocks, and DM metadata as JSON."
                  )
                  .font(.system(size: 12, design: .rounded))
                  .foregroundStyle(.white.opacity(0.48))
                  .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Text(
                  model.isExportingData
                    ? EchoCopy.string("Preparing…") : EchoCopy.string("Export")
                )
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(model.isExportingData ? 0.42 : 0.72))
              }
              .padding(.vertical, 4)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(model.isExportingData)
            .accessibilityHint(EchoCopy.string("Prepares a JSON export of your Echo account data"))

            EchoCopy.text("Friend and DM request preferences are under Friends.")
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.white.opacity(0.42))
              .padding(.top, 4)
          }
        case .advanced:
          EchoDetailSection(title: EchoCopy.string("Developer")) {
            EchoSettingToggle(
              title: EchoCopy.string("Developer Mode"),
              subtitle: EchoCopy.string(
                "Show internal Echo IDs and developer tools on this device only"),
              icon: "hammer.fill", tint: .purple, isOn: $developerModeEnabled)
            EchoSettingToggle(
              title: EchoCopy.string("Bug Hunter"),
              subtitle: EchoCopy.string(
                "Record detailed technical activity for troubleshooting on this device"),
              icon: "ladybug.fill", tint: .orange, isOn: $bugHunterEnabled)
            EchoSettingToggle(
              title: EchoCopy.string("Verbose diagnostics"),
              subtitle: EchoCopy.string("Capture extra information for troubleshooting"),
              icon: "stethoscope.fill", tint: .gray, isOn: $diagnosticsEnabled)
            EchoCopy.text(
              "Developer Mode and Bug Hunter are device-only options. Bug Hunter keeps a bounded, privacy-safe trace in memory and clears it when disabled."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        case .discord, .google, .youtube:
          externalLinkSection(model: model)
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
    navigationTitle(EchoCopy.string(""))
    .navigationBarBackButtonHidden(true)
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
    #endif
    .background(EchoSettingsBackdrop().ignoresSafeArea())
    .task {
      await model.loadRemoteState(
        syncLocale: { localeIdentifier = $0 },
        syncTimeZone: { timezoneIdentifier = $0 }
      )
    }
    .echoRetryOnNetworkRecovery(enabled: model.errorIsConnectivity) {
      model.retryPresentedFailure()
    }
    .onChange(of: model.notificationSettings) { _, _ in
      guard route == .notifications || route == .sounds else { return }
      model.saveNotifications()
    }
    .onDisappear {
      model.cancelPendingNotificationSave()
    }
    .sheet(isPresented: $showDeleteConfirmation) {
      EchoDeleteAccountSheet(password: $model.deletePassword, totpCode: $model.deleteTotpCode) {
        model.deleteAccount()
        showDeleteConfirmation = false
      }
    }
    .fileExporter(
      isPresented: $model.showExportExporter,
      document: model.exportDocument,
      contentType: .json,
      defaultFilename: model.exportFilename
    ) { result in
      model.exportDocument = nil
      if case .failure(let error) = result {
        model.presentFailure(error)
      }
    }
    .sheet(
      isPresented: Binding(
        get: { model.errorMessage != nil },
        set: {
          if !$0 { model.clearPresentedError() }
        })
    ) {
      EchoSettingsErrorSheet(
        message: model.errorMessage ?? "",
        onRetry: model.retryPresentedFailure,
        onDismiss: { model.clearPresentedError() }
      )
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
        title: EchoCopy.string("Email address"), prompt: EchoCopy.string("you@example.com"),
        value: $model.accountState.email,
        keyboard: .emailAddress
      ) { model.saveIdentity() }
    }
    .sheet(isPresented: $showUsernameEditor) {
      EchoAccountFieldSheet(
        title: EchoCopy.string("Username"), prompt: EchoCopy.string("username"),
        value: $model.accountState.username,
        keyboard: .username
      ) { model.saveUsername() }
    }
    .sheet(isPresented: $showPhoneEditor) {
      EchoAccountFieldSheet(
        title: EchoCopy.string("Phone number"), prompt: EchoCopy.string("+1 555 123 4567"),
        value: $model.accountState.phone,
        keyboard: .phonePad
      ) { model.saveIdentity() }
    }
    .sheet(isPresented: $showPhoneCodeSheet) {
      EchoAccountFieldSheet(
        title: EchoCopy.string("Verification code"), prompt: EchoCopy.string("000000"),
        value: $model.phoneVerificationCode,
        keyboard: .numberPad
      ) { model.verifyPhone() }
    }
    .sheet(isPresented: $showPasskeyRegistration) {
      EchoPasskeyRegistrationSheet(baseURL: baseURL, accessToken: accessToken) {
        Task { await model.reloadPasskeys() }
      }
    }
    .sheet(
      isPresented: Binding(
        get: { model.passkeyToRename != nil },
        set: { if !$0 { model.passkeyToRename = nil } })
    ) {
      EchoPasskeyRenameSheet(label: $model.passkeyRenameLabel) {
        model.renamePasskey()
        model.passkeyToRename = nil
      }
    }
    .sheet(isPresented: $showDisableTotp) {
      EchoDisableTotpSheet(
        password: $model.totpPassword, code: $model.totpCode, recoveryCode: $model.totpRecoveryCode
      ) {
        model.disableTotp()
        showDisableTotp = false
      }
    }
  }
}
