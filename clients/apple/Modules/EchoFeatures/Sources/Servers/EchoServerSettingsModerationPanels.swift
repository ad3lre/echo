import EchoDomain
import SwiftUI

struct EchoServerSettingsBansPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var bans: [EchoServerBan] = []
  @State private var query = ""
  @State private var scope: EchoBanExpiryFormatting.Scope = .all
  @State private var loading = false
  @State private var unbanTarget: EchoServerBan?
  @State private var unbanReason = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      EchoDesktopLabeledField(title: EchoCopy.string("Search")) {
        TextField(EchoCopy.string("Search bans"), text: $query)
      }
      Picker(EchoCopy.string("Ban type"), selection: $scope) {
        ForEach(EchoBanExpiryFormatting.Scope.allCases) { option in
          Text(option.label).tag(option)
        }
      }
      .pickerStyle(.segmented)
      if loading {
        ProgressView()
      } else if filtered.isEmpty {
        Text(
          bans.isEmpty
            ? EchoCopy.string("No bans on this server.")
            : EchoCopy.string("No bans match these filters.")
        )
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else {
        ForEach(filtered) { ban in
          banRow(ban)
        }
      }
    }
    .task { await reload() }
    .alert(
      EchoCopy.string("Unban member?"),
      isPresented: Binding(
        get: { unbanTarget != nil },
        set: { if !$0 { unbanTarget = nil } }
      )
    ) {
      TextField(EchoCopy.string("Reason"), text: $unbanReason)
      Button(EchoCopy.string("Unban"), role: .destructive) {
        Task { await unban() }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        EchoCopy.format(
          "Unban %@? Provide a short reason for the audit log.",
          unbanTarget?.displayName ?? EchoCopy.string("member")))
    }
  }

  private var filtered: [EchoServerBan] {
    EchoBanExpiryFormatting.filtered(bans, query: query, scope: scope)
  }

  private func banRow(_ ban: EchoServerBan) -> some View {
    let temporary = EchoBanExpiryFormatting.isTemporary(ban)
    return HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(ban.displayName.isEmpty ? ban.username : ban.displayName)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(temporary ? EchoCopy.string("Temporary") : EchoCopy.string("Permanent"))
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(temporary ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.55))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(
              (temporary ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.45)).opacity(0.14),
              in: Capsule())
        }
        if let reason = ban.reason, !reason.isEmpty {
          Text(reason)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
        }
        if temporary, let expires = ban.expiresAt {
          let label = EchoBanExpiryFormatting.expiresLabel(expires)
          if !label.isEmpty {
            Text(EchoCopy.format("Expires %@", label))
              .font(.system(size: 11))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
          }
        }
        if !ban.bannedByLabel.isEmpty {
          Text(EchoCopy.format("By %@", ban.bannedByLabel))
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
        }
      }
      Spacer()
      Button(EchoCopy.string("Unban")) {
        unbanTarget = ban
        unbanReason = ""
      }
      .buttonStyle(.plain)
      .foregroundStyle(EchoTheme.Color.mentionPing)
    }
    .padding(12)
    .background(
      EchoTheme.Color.ink(0.035),
      in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
  }

  private func reload() async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      bans = try await model.client.loadServerBans(
        serverID: server.id, accessToken: token)
    } catch {
      localError = EchoCopy.string("Echo couldn’t load bans.")
    }
  }

  private func unban() async {
    guard let target = unbanTarget else { return }
    let reason = unbanReason.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !reason.isEmpty else {
      localError = EchoCopy.string("Enter an unban reason.")
      return
    }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.moderateMember(
        serverID: server.id,
        action: "unban",
        targetUserID: target.userID,
        accessToken: token,
        meta: ["reason": String(reason.prefix(500))]
      )
      bans.removeAll { $0.userID == target.userID }
      unbanTarget = nil
    } catch {
      localError = EchoCopy.string("Echo couldn’t unban that member.")
    }
  }
}

struct EchoServerSettingsBannedWordsPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var config = EchoBannedWordsConfig.default(serverID: "")
  @State private var customWordsText = ""
  @State private var loading = false
  @State private var savedFlash = false

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if loading {
        ProgressView()
      } else {
        VStack(alignment: .leading, spacing: 7) {
          Text(EchoCopy.string("Preset").uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.8)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          EchoSettingsDropdown(
            selection: $config.presetLevel,
            options: EchoBannedWordsConfig.presetLevels.map { ($0, presetLabel($0)) }
          )
        }

        ForEach(EchoBannedWordsConfig.categoryKeys, id: \.self) { key in
          Toggle(isOn: categoryEnabledBinding(key)) {
            Text(categoryLabel(key))
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
          }
          .toggleStyle(.switch)
          .padding(14)
          .background(
            EchoTheme.Color.ink(0.035),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
          )
        }

        EchoDesktopLabeledField(title: EchoCopy.string("Custom words"), minHeight: 88) {
          TextField(
            EchoCopy.string("one, two, three"),
            text: $customWordsText,
            axis: .vertical
          )
          .lineLimit(3...8)
        }

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

  private func categoryEnabledBinding(_ key: String) -> Binding<Bool> {
    Binding(
      get: { config.categories[key]?.enabled ?? false },
      set: { on in
        var cat = config.categories[key] ?? EchoBannedWordCategoryConfig()
        cat.enabled = on
        config.categories[key] = cat
        if config.presetLevel != "custom" { config.presetLevel = "custom" }
      }
    )
  }

  private func reload() async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      config = try await model.client.loadBannedWordsConfig(
        serverID: server.id, accessToken: token)
      customWordsText = config.customWords.joined(separator: ", ")
    } catch {
      localError = EchoCopy.string("Echo couldn’t load banned words.")
      config = .default(serverID: server.id)
    }
  }

  private func save() async {
    localError = nil
    savedFlash = false
    config.customWords = customWordsText
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    do {
      let token = try await model.auth.ensureAccessToken()
      config = try await model.client.saveBannedWordsConfig(
        serverID: server.id, config: config, accessToken: token)
      customWordsText = config.customWords.joined(separator: ", ")
      savedFlash = true
    } catch {
      localError = EchoCopy.string("Echo couldn’t save banned words.")
    }
  }

  private func presetLabel(_ level: String) -> String {
    switch level {
    case "off": EchoCopy.string("Off")
    case "low": EchoCopy.string("Low")
    case "medium": EchoCopy.string("Medium")
    case "high": EchoCopy.string("High")
    case "custom": EchoCopy.string("Custom")
    default: level
    }
  }

  private func categoryLabel(_ key: String) -> String {
    switch key {
    case "profanity": EchoCopy.string("Profanity")
    case "slurs": EchoCopy.string("Slurs & Hate Speech")
    case "sexual_content": EchoCopy.string("Sexual Content")
    case "insults": EchoCopy.string("Insults")
    default: key
    }
  }
}
