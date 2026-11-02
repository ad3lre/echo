import EchoDomain
import PhotosUI
import SwiftUI

extension EchoServerSettingsView {
  // MARK: - Overview

  var overviewSection: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 16) {
        overviewDetailsPanel
          .frame(maxWidth: .infinity, alignment: .topLeading)
        overviewBrandingColumn
          .frame(maxWidth: .infinity, alignment: .topLeading)
      }
      if canManage { saveBar }
    }
  }

  var overviewDetailsPanel: some View {
    EchoSettingsPanel(title: EchoCopy.string("Server details")) {
      VStack(alignment: .leading, spacing: 14) {
        EchoDesktopLabeledField(title: EchoCopy.string("Server name")) {
          TextField(EchoCopy.string("Server name"), text: $name)
            .disabled(!canManage)
        }
        EchoDesktopLabeledField(title: EchoCopy.string("Description"), minHeight: 120) {
          TextField(
            EchoCopy.string("What is this server about?"),
            text: $description,
            axis: .vertical
          )
          .lineLimit(4...8)
          .disabled(!canManage)
        }
        EchoDesktopLabeledField(title: EchoCopy.string("Server tags")) {
          TextField(EchoCopy.string("gaming, art, music"), text: $tagsText)
            .disabled(!canManage)
        }
        Text(EchoCopy.string("Comma-separated tags help people find this server in Explore."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
        vanityField
      }
    }
  }

  var vanityField: some View {
    let hostPrefix: String = {
      let host = baseURL.host?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return host.isEmpty ? "" : "\(host)/"
    }()
    return VStack(alignment: .leading, spacing: 7) {
      Text(EchoCopy.string("Vanity URL").uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      HStack(spacing: 0) {
        if !hostPrefix.isEmpty {
          Text(hostPrefix)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(EchoTheme.Color.ink(0.04))
          Rectangle()
            .fill(EchoTheme.Color.ink(0.08))
            .frame(width: 1)
        }
        TextField(EchoCopy.string("cool-server"), text: $vanityCode)
          .textFieldStyle(.plain)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(EchoTheme.Color.fg)
          .padding(.horizontal, 12)
          .padding(.vertical, 10)
          .disabled(!canManage)
      }
      .frame(minHeight: 40)
      .background(
        EchoTheme.Color.elevatedMid,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
  }

  var overviewBrandingColumn: some View {
    VStack(alignment: .leading, spacing: 16) {
      brandingHero
      EchoSettingsPanel(title: EchoCopy.string("Channel banner")) {
        VStack(alignment: .leading, spacing: 0) {
          settingsToggleInline(
            title: EchoCopy.string("Blur banner"),
            subtitle: EchoCopy.string("Soft-focus the banner in the channel header."),
            isOn: $bannerBlurEnabled
          )
          Divider().opacity(0.35).padding(.vertical, 10)
          settingsToggleInline(
            title: EchoCopy.string("Banner blackout"),
            subtitle: EchoCopy.string("Dim the banner for stronger text contrast."),
            isOn: $bannerBlackoutEnabled
          )
        }
      }
      welcomeChannelPicker
    }
  }

  var brandingHero: some View {
    VStack(alignment: .leading, spacing: 0) {
      ZStack(alignment: .topTrailing) {
        ZStack {
          Group {
            if let pendingBannerData, let image = platformImage(pendingBannerData) {
              image.resizable().scaledToFill()
            } else {
              EchoServerBannerStrip(
                bannerURL: liveServer.bannerURL,
                baseURL: baseURL,
                accessToken: accessToken,
                height: 128
              ) {
                EchoTheme.Color.ink(0.08)
              }
            }
          }
          .frame(height: 128)
          .frame(maxWidth: .infinity)
          .clipped()

          if bannerBlurEnabled {
            Rectangle()
              .fill(.ultraThinMaterial)
              .opacity(0.85)
          }
          if bannerBlackoutEnabled {
            EchoTheme.Color.ink(0.45)
          }
          LinearGradient(
            colors: [.clear, EchoTheme.Color.ink(0.28)],
            startPoint: .center,
            endPoint: .bottom
          )
        }
        .frame(height: 128)
        .clipShape(
          UnevenRoundedRectangle(
            topLeadingRadius: 16, bottomLeadingRadius: 0,
            bottomTrailingRadius: 0, topTrailingRadius: 16,
            style: .continuous
          )
        )

        if canManage {
          PhotosPicker(selection: $bannerItem, matching: .images) {
            Image(systemName: "ellipsis")
              .font(.system(size: 13, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: 32, height: 32)
              .background(Color.black.opacity(0.55), in: Circle())
              .overlay {
                Circle().strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
              }
          }
          .buttonStyle(.plain)
          .padding(12)
          .help(EchoCopy.string("Change banner"))
        }
      }

      HStack(alignment: .top, spacing: 14) {
        ZStack(alignment: .bottomTrailing) {
          Group {
            if let pendingIconData, let image = platformImage(pendingIconData) {
              image.resizable().scaledToFill()
            } else {
              EchoServerIcon(
                iconURL: liveServer.iconURL,
                name: liveServer.name,
                baseURL: baseURL,
                accessToken: accessToken,
                bannerURL: liveServer.bannerURL
              )
            }
          }
          .frame(width: 64, height: 64)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .strokeBorder(EchoTheme.Color.ink(0.12), lineWidth: 1)
          }
          .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
          if canManage {
            PhotosPicker(selection: $iconItem, matching: .images) {
              Image(systemName: "pencil")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(EchoTheme.Color.fg)
                .frame(width: 22, height: 22)
                .background(EchoTheme.Color.elevated, in: Circle())
                .overlay {
                  Circle().strokeBorder(EchoTheme.Color.ink(0.12), lineWidth: 1)
                }
            }
            .buttonStyle(.plain)
            .offset(x: 4, y: 4)
            .help(EchoCopy.string("Change server icon"))
          }
        }
        .offset(y: -28)
        .padding(.bottom, -28)

        VStack(alignment: .leading, spacing: 4) {
          Text(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? liveServer.name : name)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(2)
          let desc = description.trimmingCharacters(in: .whitespacesAndNewlines)
          if !desc.isEmpty {
            Text(desc)
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
              .lineLimit(3)
          }
          Text(EchoCopy.format("%d members", model.members(for: liveServer.id).count))
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .padding(.top, 2)
        }
        .padding(.top, 12)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 18)
      .padding(.bottom, 16)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.03),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.07), lineWidth: 1)
    }
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }

  var welcomeChannelPicker: some View {
    let textChannels = model.channels(for: liveServer.id).filter(\.isTextLike)
    var options: [(String, String)] = [("", EchoCopy.string("None"))]
    options += textChannels.map { ($0.id, "#\($0.name)") }
    return EchoSettingsPanel(
      title: EchoCopy.string("Welcome channel"),
      subtitle: EchoCopy.string(
        "Post a system message in this channel when someone joins.")
    ) {
      EchoSettingsDropdown(
        selection: $welcomeChannelID,
        options: options,
        disabled: !canManage,
        searchable: textChannels.count > 12
      )
      .frame(maxWidth: 360)
    }
  }

  // MARK: - Access / Security / Moderation

  var accessSection: some View {
    VStack(alignment: .leading, spacing: 14) {
      settingsToggle(
        title: EchoCopy.string("Listed in Explore"),
        subtitle: EchoCopy.string("Show this server in the public directory."),
        isOn: $listedInDirectory
      )
      settingsToggle(
        title: EchoCopy.string("Invite join enabled"),
        subtitle: EchoCopy.string("Allow people to join with invite links or vanity."),
        isOn: $inviteJoinEnabled
      )
      settingsToggle(
        title: EchoCopy.string("Applications enabled"),
        subtitle: EchoCopy.string("Require an application before joining."),
        isOn: $applicationsEnabled
      )
      if canManage { saveBar }
      if canManage {
        EchoServerSettingsApplicationsPanel(
          server: liveServer, model: model, localError: $localError
        )
        .padding(.top, 12)
      }
    }
  }

  var securitySection: some View {
    VStack(alignment: .leading, spacing: 14) {
      settingsToggle(
        title: EchoCopy.string("Allow global guests"),
        subtitle: EchoCopy.string("Guests can browse Explore and join with invites."),
        isOn: $allowGlobalGuests
      )
      settingsToggle(
        title: EchoCopy.string("Require verified email"),
        subtitle: EchoCopy.string("New members must have a verified email address."),
        isOn: $verificationRequireEmail
      )
      if canManage { saveBar }
    }
  }

  var moderationSection: some View {
    VStack(alignment: .leading, spacing: 14) {
      settingsToggle(
        title: EchoCopy.string("Automod spam filter"),
        subtitle: EchoCopy.string("Block obvious spam bursts in text channels."),
        isOn: $automodSpamEnabled
      )
      settingsToggle(
        title: EchoCopy.string("Raid protection"),
        subtitle: EchoCopy.string("Throttle burst joins into this server."),
        isOn: $raidProtectionEnabled
      )
      if raidProtectionEnabled {
        EchoDesktopLabeledField(title: EchoCopy.string("Join threshold")) {
          TextField(EchoCopy.string("10"), value: $raidJoinThresholdCount, format: .number)
            .disabled(!canManage)
        }
        EchoDesktopLabeledField(title: EchoCopy.string("Window (seconds)")) {
          TextField(EchoCopy.string("60"), value: $raidJoinWindowSeconds, format: .number)
            .disabled(!canManage)
        }
      }
      if canManage { saveBar }
    }
  }

  // MARK: - Members

  var membersSection: some View {
    let preferLight = colorScheme == .light
    let query = memberQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let members = model.members(for: liveServer.id).filter { member in
      guard !query.isEmpty else { return true }
      return member.name.lowercased().contains(query)
        || (member.username?.lowercased().contains(query) ?? false)
    }
    return VStack(alignment: .leading, spacing: 12) {
      EchoDesktopLabeledField(title: EchoCopy.string("Search")) {
        TextField(EchoCopy.string("Search members"), text: $memberQuery)
      }
      VStack(alignment: .leading, spacing: 4) {
        ForEach(members) { member in
          let roles = model.displayedRoles(
            for: liveServer.id, userID: member.userID, preferLight: preferLight)
          HStack(spacing: 12) {
            EchoVoiceAvatar(
              name: member.name,
              userID: member.userID,
              avatarURL: member.avatarURL,
              baseURL: baseURL,
              accessToken: accessToken,
              isSpeaking: false,
              size: 32
            )
            VStack(alignment: .leading, spacing: 2) {
              Text(member.name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.fg)
              if let top = roles.first {
                Text(top.name)
                  .font(.system(size: 12))
                  .foregroundStyle(
                    Color(hex: top.displayColor(preferLight: preferLight))
                      ?? EchoTheme.Color.ink(0.45))
              }
            }
            Spacer()
            if member.isGuest {
              Text(EchoCopy.string("Guest"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.ink(0.45))
            }
          }
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
          .background(
            EchoTheme.Color.ink(0.035),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
          )
        }
      }
    }
  }

  // MARK: - Danger

  var dangerSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      if !isOwner {
        dangerCard(
          title: EchoCopy.string("Leave server"),
          body: EchoCopy.format(
            "Leave %@? You can rejoin later with an invite.", liveServer.name),
          actionTitle: EchoCopy.string("Leave server")
        ) {
          showingLeave = true
        }
      } else {
        transferCard
        deleteCard
      }
    }
  }

  var transferCard: some View {
    let candidates = model.members(for: liveServer.id).filter {
      !EchoUserIdentity.matches($0.userID, userID)
    }
    return VStack(alignment: .leading, spacing: 12) {
      Text(EchoCopy.string("Transfer ownership"))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(EchoCopy.string("Pass ownership to another member before you leave."))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      if candidates.isEmpty {
        Text(EchoCopy.string("Invite someone else before transferring ownership."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      } else {
        EchoSettingsDropdown(
          selection: $transferOwnerID,
          options: [("", EchoCopy.string("Select a member"))]
            + candidates.map { ($0.userID, $0.name) },
          searchable: candidates.count > 12
        )
        Button(EchoCopy.string("Transfer")) {
          showingTransfer = true
        }
        .buttonStyle(.plain)
        .disabled(transferOwnerID.isEmpty)
        .foregroundStyle(
          transferOwnerID.isEmpty
            ? EchoTheme.Color.ink(0.35) : EchoTheme.Color.mentionPing)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.mentionPing.opacity(0.06),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(EchoTheme.Color.mentionPing.opacity(0.22), lineWidth: 1)
    }
    .onAppear {
      if transferOwnerID.isEmpty { transferOwnerID = candidates.first?.userID ?? "" }
    }
  }

  var deleteCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(EchoCopy.string("Delete server"))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(EchoCopy.format("Delete %@ permanently? This cannot be undone.", liveServer.name))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      EchoDesktopLabeledField(title: EchoCopy.string("Type server name to confirm")) {
        TextField(liveServer.name, text: $deleteNameConfirm)
      }
      Button(EchoCopy.string("Delete server")) {
        Task {
          if await model.delete(liveServer) { onLeftServer() }
          else { localError = model.actionErrorMessage }
        }
      }
      .buttonStyle(.plain)
      .disabled(
        deleteNameConfirm.trimmingCharacters(in: .whitespacesAndNewlines) != liveServer.name
      )
      .foregroundStyle(
        deleteNameConfirm.trimmingCharacters(in: .whitespacesAndNewlines) == liveServer.name
          ? EchoTheme.Color.mentionPing : EchoTheme.Color.ink(0.35)
      )
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.mentionPing.opacity(0.06),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(EchoTheme.Color.mentionPing.opacity(0.22), lineWidth: 1)
    }
  }

  func dangerCard(
    title: String,
    body: String,
    actionTitle: String,
    action: @escaping () -> Void
  ) -> some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(body)
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 12)
      Button(action: action) {
        Text(actionTitle)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.mentionPing)
          .padding(.horizontal, 12)
          .frame(height: 32)
          .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .strokeBorder(EchoTheme.Color.mentionPing.opacity(0.55), lineWidth: 1)
          }
      }
      .buttonStyle(.plain)
    }
    .padding(16)
    .background(
      EchoTheme.Color.mentionPing.opacity(0.06),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(EchoTheme.Color.mentionPing.opacity(0.22), lineWidth: 1)
    }
  }

  // MARK: - Shared controls

  var saveBar: some View {
    HStack {
      if savedFlash {
        Text(EchoCopy.string("Saved"))
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(EchoTheme.Color.presenceOnline)
      }
      Spacer()
      EchoDesktopPrimaryButton(title: EchoCopy.string("Save Changes")) {
        Task { await saveCurrentSection() }
      }
    }
    .padding(.top, 4)
  }

  func settingsToggle(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
    settingsToggleInline(title: title, subtitle: subtitle, isOn: isOn)
      .padding(14)
      .background(
        EchoTheme.Color.ink(0.035),
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
  }

  func settingsToggleInline(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
    Toggle(isOn: isOn) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(subtitle)
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .toggleStyle(.switch)
    .disabled(!canManage)
  }
}
