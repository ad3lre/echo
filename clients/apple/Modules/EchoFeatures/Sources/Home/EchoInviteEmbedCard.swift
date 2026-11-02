import EchoDomain
import EchoNetworking
import SwiftUI

/// Invite cards under a message that contains Echo invite URLs (web `ChatInviteEmbed`).
struct EchoMessageInviteEmbeds: View {
  let content: String
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    let links = EchoInviteLinks.urls(in: content, trustedHosts: hosts)
    if !links.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(links.prefix(3), id: \.self) { link in
          EchoInviteEmbedCard(link: link, baseURL: baseURL, accessToken: accessToken)
        }
      }
    }
  }

  private var hosts: Set<String> {
    Set([baseURL.host, "chat-echo.com"].compactMap { $0 })
  }
}

struct EchoInviteEmbedCard: View {
  let link: String
  let baseURL: URL
  var accessToken: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoInviteEmbedModel?

  var body: some View {
    Group {
      if let model { card(model) }
    }
    .task(id: link) {
      let next = EchoInviteEmbedModel(link: link, baseURL: baseURL, auth: auth)
      model = next
      await next.loadPreview()
    }
  }

  @ViewBuilder
  private func card(_ model: EchoInviteEmbedModel) -> some View {
    if let preview = model.preview {
      VStack(alignment: .leading, spacing: 8) {
        EchoCopy.text(preview.isVoiceInvite ? "You’ve been invited to a voice channel" : "You’ve been invited to join a server")
          .font(.system(size: 11, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        HStack(spacing: 12) {
          EchoMediaImage(source: preview.iconURL, baseURL: baseURL, accessToken: accessToken) {
            EchoGeneratedAvatar(name: preview.name, seed: preview.serverID ?? model.token)
          }
          .frame(width: 48, height: 48)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: preview.name)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.92)).lineLimit(1)
            Text(verbatim: model.subtitle(preview))
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.5)).lineLimit(1)
          }
          Spacer(minLength: 8)
          joinButton(model)
        }
        if let note = model.note {
          Text(note).font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(model.joinFailed ? Color.red.opacity(0.85) : EchoTheme.Color.ink(0.55))
        }
      }
      .padding(12)
      .frame(maxWidth: 380, alignment: .leading)
      .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.format("Server invite: %@", preview.name))
    } else if model.isLoading {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(EchoTheme.Color.ink(0.05)).frame(width: 380, height: 84).frame(maxWidth: 380)
    }
  }

  private func joinButton(_ model: EchoInviteEmbedModel) -> some View {
    Button {
      Task { await model.join() }
    } label: {
      Group {
        if model.isJoining {
          ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
        } else {
          EchoCopy.text(model.hasJoined ? "Joined" : "Join")
        }
      }
      .font(.system(size: 13, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.onAccent)
      .padding(.horizontal, 16).frame(minHeight: 34)
      .background(model.hasJoined ? EchoTheme.Color.presenceOnline : EchoTheme.Color.indigo, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(model.isJoining || model.hasJoined)
  }
}
