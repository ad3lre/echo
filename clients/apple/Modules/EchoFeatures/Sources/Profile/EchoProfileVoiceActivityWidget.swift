import EchoDomain
import SwiftUI

/// Web `ProfileVoiceActivityWidget` — primary “in voice” card on member profiles.
struct EchoProfileVoiceActivityWidget: View {
  let activities: [EchoUserVoiceChannelPresence]
  var compact = false
  var joinable = false
  var baseURL: URL? = nil
  var accessToken: String? = nil
  var onJoin: ((EchoUserVoiceChannelPresence) -> Void)? = nil

  private var primary: EchoUserVoiceChannelPresence? { activities.first }
  private var extraCount: Int { max(0, activities.count - 1) }
  private var showJoin: Bool {
    primary != nil && joinable && !compact && onJoin != nil
  }

  var body: some View {
    if let primary {
      VStack(alignment: .leading, spacing: compact ? 6 : 8) {
        if extraCount > 0 {
          Text(EchoCopy.format("+%d more", extraCount))
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
        }
        HStack(alignment: .center, spacing: 10) {
          VStack(alignment: .leading, spacing: 2) {
            Text(primary.channelName)
              .font(.system(size: compact ? 13 : 14, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.fg)
              .lineLimit(1)
            Text(primary.serverName)
              .font(.system(size: 12, weight: .regular, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
              .lineLimit(1)
          }
          Spacer(minLength: 0)
          if showJoin {
            Button(EchoCopy.string("Join")) {
              onJoin?(primary)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
          }
        }
        if !primary.participantUserIDs.isEmpty {
          participantsRow(primary)
        }
        if !showJoin {
          Text(
            extraCount == 0
              ? EchoCopy.string("Active now")
              : EchoCopy.format("%@ in %@", primary.channelName, primary.serverName)
          )
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        }
      }
      .padding(compact ? 10 : 12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        widgetBackground(primary)
      }
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .accessibilityElement(children: .combine)
      .accessibilityLabel(
        EchoCopy.format(
          "In voice channel %@ in %@", primary.channelName, primary.serverName))
    }
  }

  @ViewBuilder
  private func participantsRow(_ primary: EchoUserVoiceChannelPresence) -> some View {
    let urls = Array(primary.participantAvatarURLs.prefix(4))
    let overflow = max(0, primary.participantUserIDs.count - max(urls.count, 0))
    HStack(spacing: 8) {
      if let baseURL, !urls.isEmpty {
        HStack(spacing: -6) {
          ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
            EchoMediaImage(source: url, baseURL: baseURL, accessToken: accessToken, maxPixelSize: 64)
            {
              Circle().fill(EchoTheme.Color.glass2)
            }
            .frame(width: 20, height: 20)
            .clipShape(Circle())
            .overlay(Circle().stroke(EchoTheme.Color.canvas, lineWidth: 1.5))
            .zIndex(Double(10 - index))
          }
        }
      }
      Text(EchoCopy.format("%d in channel", primary.participantUserIDs.count))
        .font(.system(size: 11, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
      if overflow > 0, !urls.isEmpty {
        Text(EchoCopy.format("+%d more", overflow))
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }
    }
  }

  @ViewBuilder
  private func widgetBackground(_ primary: EchoUserVoiceChannelPresence) -> some View {
    ZStack {
      EchoTheme.Color.elevated
      if let banner = primary.serverBannerURL, let baseURL {
        EchoMediaImage(source: banner, baseURL: baseURL, accessToken: accessToken) {
          Color.clear
        }
        .opacity(0.35)
        LinearGradient(
          colors: [
            EchoTheme.Color.canvas.opacity(0.55),
            EchoTheme.Color.canvas.opacity(0.85),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
    }
  }
}
