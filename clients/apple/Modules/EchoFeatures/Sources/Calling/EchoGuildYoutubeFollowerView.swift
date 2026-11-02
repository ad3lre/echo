import SwiftUI

/// Now-playing card for a peer's YouTube voice activity. Follower mode only:
/// playback mirrors the host. Hosting (search / queue) is `EchoGuildYoutubeHostView`.
struct EchoGuildYoutubeFollowerView: View {
  var session: EchoGuildVoiceSession
  /// Resolves a display name for the host's user id.
  var hostName: (String) -> String?

  @Environment(\.openURL) private var openURL

  var body: some View {
    if let followed = session.followedYoutube {
      card(activity: followed.activity, entry: followed.entry)
    } else if session.canResumeYoutubeFollow {
      resumeBar
    }
  }

  private func card(activity: EchoYoutubeActivity, entry: EchoYoutubePlaylistEntry) -> some View {
    let host = hostName(activity.fromUserID) ?? activity.fromName ?? activity.fromUserID
    return VStack(alignment: .leading, spacing: 10) {
      EchoYoutubePlayerWebView(
        videoID: entry.id, playback: activity.playback, revision: activity.updatedAt
      )
      .aspectRatio(16 / 9, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .frame(maxWidth: 560)
      HStack(alignment: .top, spacing: 10) {
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(2)
          Text(entry.channelTitle)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.52))
            .lineLimit(1)
          Text(EchoCopy.format("%@ is hosting", host))
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        pill(EchoCopy.string("Open in YouTube")) { openURL(watchURL(entry, activity.playback)) }
        pill(EchoCopy.string("Stop following")) { session.setFollowingYoutube(false) }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(EchoTheme.Color.ink(0.04))
    .overlay(alignment: .bottom) { Divider().overlay(EchoTheme.Color.ink(0.08)) }
  }

  private var resumeBar: some View {
    HStack {
      Image(systemName: "play.rectangle.fill").foregroundStyle(EchoTheme.Color.ink(0.6))
      Text(EchoCopy.string("Someone is watching YouTube"))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.7))
      Spacer(minLength: 0)
      pill(EchoCopy.string("Follow YouTube")) { session.setFollowingYoutube(true) }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(EchoTheme.Color.ink(0.04))
  }

  private func pill(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(EchoTheme.Color.ink(0.08), in: Capsule())
    }
    .buttonStyle(.plain)
  }

  private func watchURL(_ entry: EchoYoutubePlaylistEntry, _ sample: EchoYoutubePlaybackSync?)
    -> URL
  {
    var components = URLComponents(string: "https://www.youtube.com/watch")!
    var items = [URLQueryItem(name: "v", value: entry.id)]
    if let sample { items.append(URLQueryItem(name: "t", value: "\(Int(sample.expectedMediaTime()))s")) }
    components.queryItems = items
    return components.url ?? URL(string: "https://www.youtube.com")!
  }
}
