import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Web `InviteUsersModal` — friends + invite link, centered glass overlay.
struct EchoServerInviteModal: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  let userID: String
  var accessToken: String? = nil
  /// When set, share URL and DM text append `?voice=` (web voice-channel invite).
  var voiceChannelID: String? = nil
  var voiceChannelName: String? = nil
  var onClose: () -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var friends: [EchoUserProfile] = []
  @State private var search = ""
  @State private var inviteURL = ""
  @State private var loadingLink = true
  @State private var loadingFriends = true
  @State private var copied = false
  @State private var invitedIDs = Set<String>()
  @State private var inviteError: String?

  private var isVoiceInvite: Bool {
    !(voiceChannelID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
  }

  private var filtered: [EchoUserProfile] {
    let needle = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if needle.isEmpty { return friends }
    return friends.filter {
      $0.name.lowercased().contains(needle)
        || ($0.username?.lowercased().contains(needle) ?? false)
    }
  }

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 560, onClose: onClose) {
      VStack(alignment: .leading, spacing: 0) {
        header
        if !friends.isEmpty || loadingFriends {
          friendsSection
          divider
        }
        linkSection
        if let inviteError {
          Text(inviteError)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.mentionPing)
            .padding(.top, 12)
        }
      }
      .overlay(alignment: .topTrailing) {
        EchoGuildModalCloseButton(action: onClose)
          .offset(x: 4, y: -4)
      }
    }
    .task {
      async let link: Void = loadLink()
      async let people: Void = loadFriends()
      _ = await (link, people)
    }
  }

  private var header: some View {
    VStack(spacing: 6) {
      Text(EchoCopy.string("Invite People"))
        .font(.system(size: 20, weight: .bold))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(headerSubtitle)
        .font(.system(size: 14))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 8)
    .padding(.bottom, 4)
  }

  private var headerSubtitle: String {
    if isVoiceInvite, let name = voiceChannelName?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    {
      return EchoCopy.format("Invite friends to %@ in %@.", name, server.name)
    }
    return EchoCopy.format("Invite friends to %@.", server.name)
  }

  private var friendsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(EchoCopy.string("Friends"))
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        Spacer()
        Text(friendCountLabel)
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      .padding(.top, 18)

      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.38))
        TextField(EchoCopy.string("Search friends"), text: $search)
          .textFieldStyle(.plain)
          .font(.system(size: 14))
      }
      .padding(.horizontal, 12)
      .frame(height: 40)
      .background(
        EchoTheme.Color.elevatedMid,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(EchoTheme.Color.ink(0.10), lineWidth: 1)
      }

      ScrollView(showsIndicators: false) {
        LazyVStack(spacing: 4) {
          if loadingFriends {
            ProgressView()
              .frame(maxWidth: .infinity)
              .padding(.vertical, 28)
          } else if filtered.isEmpty {
            Text(EchoCopy.string("No friends match your search."))
              .font(.system(size: 14))
              .foregroundStyle(EchoTheme.Color.ink(0.48))
              .frame(maxWidth: .infinity)
              .padding(.vertical, 22)
              .background(
                EchoTheme.Color.elevatedMid,
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                  .strokeBorder(EchoTheme.Color.ink(0.10), lineWidth: 1)
              }
          } else {
            ForEach(filtered) { friend in
              friendRow(friend)
            }
          }
        }
      }
      .frame(minHeight: 160, maxHeight: 280)
    }
  }

  private func friendRow(_ friend: EchoUserProfile) -> some View {
    let invited = invitedIDs.contains(friend.id)
    return HStack(spacing: 12) {
      EchoVoiceAvatar(
        name: friend.name,
        userID: friend.id,
        avatarURL: friend.avatarURL,
        baseURL: baseURL,
        accessToken: accessToken ?? auth.activeSession?.accessToken,
        isSpeaking: false,
        size: 36
      )
      Text(friend.name)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 8)
      Button {
        Task { await invite(friend) }
      } label: {
        Text(invited ? EchoCopy.string("Invited") : EchoCopy.string("Invite"))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(
            invited ? EchoTheme.Color.presenceOnline : EchoTheme.Color.fg
          )
          .padding(.horizontal, 12)
          .frame(height: 30)
          .background(
            invited
              ? EchoTheme.Color.presenceOnline.opacity(0.16)
              : EchoTheme.Color.elevatedMid,
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .strokeBorder(
                invited
                  ? EchoTheme.Color.presenceOnline.opacity(0.36)
                  : EchoTheme.Color.ink(0.12),
                lineWidth: 1
              )
          }
      }
      .buttonStyle(.plain)
      .disabled(invited || inviteURL.isEmpty)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(
      EchoTheme.Color.ink(0.04),
      in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
  }

  private var divider: some View {
    HStack(spacing: 12) {
      Rectangle().fill(EchoTheme.Color.ink(0.10)).frame(height: 1)
      Text(EchoCopy.string("or send an invite link"))
        .font(.system(size: 11, weight: .bold))
        .tracking(1.2)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .textCase(.uppercase)
        .fixedSize()
      Rectangle().fill(EchoTheme.Color.ink(0.10)).frame(height: 1)
    }
    .padding(.vertical, 20)
  }

  private var linkSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(EchoCopy.string("Invite link"))
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .textCase(.uppercase)
      if loadingLink {
        Text(EchoCopy.string("Loading invite link…"))
          .font(.system(size: 14))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .background(
            EchoTheme.Color.elevatedMid,
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
          )
      } else if inviteURL.isEmpty {
        Text(EchoCopy.string("Echo couldn’t load an invite link."))
          .font(.system(size: 14))
          .foregroundStyle(EchoTheme.Color.fg)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .background(
            EchoTheme.Color.elevatedMid,
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
          )
      } else {
        HStack(spacing: 8) {
          Text(inviteURL)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(1)
            .textSelection(.enabled)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(
              EchoTheme.Color.elevatedMid,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .overlay {
              RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(EchoTheme.Color.ink(0.10), lineWidth: 1)
            }
          Button(action: copyLink) {
            Text(copied ? EchoCopy.string("Copied!") : EchoCopy.string("Copy"))
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
              .frame(minWidth: 88)
              .frame(height: 44)
              .background(
                EchoTheme.Color.ink(0.08),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                  .strokeBorder(EchoTheme.Color.ink(0.12), lineWidth: 1)
              }
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private var friendCountLabel: String {
    let count = filtered.count
    return count == 1
      ? EchoCopy.format("%d friend", count)
      : EchoCopy.format("%d friends", count)
  }

  private func loadLink() async {
    loadingLink = true
    let base = await model.inviteURL(for: server) ?? ""
    inviteURL = EchoInviteShareURL.appendingVoice(base, voiceChannelID: voiceChannelID)
    loadingLink = false
  }

  private func loadFriends() async {
    loadingFriends = true
    defer { loadingFriends = false }
    do {
      let token = try await auth.ensureAccessToken()
      let client = EchoSettingsClient(baseURL: baseURL)
      let rows = try await client.loadFriends(accessToken: token)
      let ids = rows.map(\.peerID).filter { !EchoUserIdentity.matches($0, userID) }
      friends = try await client.loadProfiles(userIDs: ids, accessToken: token)
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    } catch {
      friends = []
    }
  }

  private func invite(_ friend: EchoUserProfile) async {
    guard !inviteURL.isEmpty else { return }
    inviteError = nil
    do {
      let token = try await auth.ensureAccessToken()
      let home = EchoHomeClient(baseURL: baseURL)
      let channelID = try await home.openDirectMessage(
        peerUserID: friend.id, accessToken: token)
      let text: String = {
        if isVoiceInvite, let name = voiceChannelName?.trimmingCharacters(in: .whitespacesAndNewlines),
          !name.isEmpty
        {
          return "\(server.name) · \(name)\n\(inviteURL)"
        }
        return "\(server.name)\n\(inviteURL)"
      }()
      _ = try await home.sendMessage(
        accessToken: token,
        channelID: channelID,
        currentUserID: userID,
        content: text
      )
      invitedIDs.insert(friend.id)
    } catch {
      inviteError = EchoCopy.string("Could not send the invite. Try again.")
    }
  }

  private func copyLink() {
    #if os(iOS)
      UIPasteboard.general.string = inviteURL
    #else
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(inviteURL, forType: .string)
    #endif
    copied = true
    Task {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      copied = false
    }
  }
}
