import SwiftUI

/// What fills the voice column above the controls: the activity picker, this user's
/// YouTube host / embed surface, or (when nothing is open locally) follower mode for
/// whatever a peer is hosting.
struct EchoGuildActivitySurface: View {
  var session: EchoGuildVoiceSession
  /// Resolves a display name for a peer's user id.
  var hostName: (String) -> String?

  @Environment(\.openURL) private var openURL

  var body: some View {
    let controller = session.activity
    switch controller.surface {
    case .closed:
      VStack(spacing: 0) {
        EchoGuildYoutubeFollowerView(session: session, hostName: hostName)
        peerEmbedBanner
        peerWatchTogetherBanner
      }
    case .picker:
      picker(controller)
    case .youtube:
      EchoGuildYoutubeHostView(controller: controller)
    case .watchTogether:
      EchoWatchTogetherSurface(session: session, hostName: hostName)
    case .embed(.ticTacToe):
      EchoTicTacToeSurface(session: session, hostName: hostName)
    case .embed(.wordle):
      EchoWordlineSurface(session: session)
    case .embed(.hangman):
      EchoHangmanSurface(session: session, hostName: hostName)
    case .embed(.skriggles):
      EchoSkrigglesSurface(session: session, hostName: hostName)
    case .embed(let activity):
      embed(activity, controller: controller)
    }
  }

  private func picker(_ controller: EchoGuildActivityController) -> some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: EchoCopy.string("Activities"), onClose: controller.close)
      ScrollView(showsIndicators: false) {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 12)], spacing: 12) {
          ForEach(EchoVcActivity.libraryVisible) { activity in
            Button { controller.open(activity) } label: {
              VStack(spacing: 8) {
                Image(systemName: activity.symbol).font(.system(size: 24))
                Text(activity.title)
                  .font(.system(size: 13, weight: .semibold))
                  .lineLimit(1)
              }
              .foregroundStyle(EchoTheme.Color.fg)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 20)
              .background(
                EchoTheme.Color.ink(0.06),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
          }
        }
        .padding(16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func embed(_ activity: EchoVcActivity, controller: EchoGuildActivityController)
    -> some View
  {
    VStack(spacing: 0) {
      EchoActivityHeader(title: activity.title, onClose: controller.close) {
        if let url = activity.embedURL {
          Button { openURL(url) } label: {
            Image(systemName: "safari")
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
              .frame(width: 32, height: 32)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Open in browser"))
        }
      }
      if let url = activity.embedURL {
        EchoEmbedWebView(url: url)
          .id(activity)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  /// A peer started Watch Together: offer to follow along (web phase `watch_together`).
  @ViewBuilder
  private var peerWatchTogetherBanner: some View {
    if EchoWatchTogether.isEnabled, let peer = session.peerWatchTogether {
      HStack {
        Image(systemName: EchoVcActivity.watchTogether.symbol)
          .foregroundStyle(EchoTheme.Color.ink(0.6))
        Text(
          EchoCopy.format(
            "%@ is hosting Watch Together", hostName(peer.fromUserID) ?? peer.fromName ?? peer.fromUserID)
        )
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.7))
        .lineLimit(1)
        Spacer(minLength: 0)
        Button { session.activity.open(.watchTogether) } label: {
          Text(EchoCopy.string("Join"))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(EchoTheme.Color.ink(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .background(EchoTheme.Color.ink(0.04))
    }
  }

  /// A peer opened an iframe game: offer to open the same one (web follows the phase).
  @ViewBuilder
  private var peerEmbedBanner: some View {
    if session.isJoined, let peer = session.youtubeActivity,
      let activity = EchoVcActivity(rawValue: peer.activityPhase), activity != .youtube,
      activity != .watchTogether
    {
      HStack {
        Image(systemName: activity.symbol).foregroundStyle(EchoTheme.Color.ink(0.6))
        Text(
          EchoCopy.format(
            "%@ is playing %@", hostName(peer.fromUserID) ?? peer.fromName ?? peer.fromUserID,
            activity.title)
        )
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.7))
        .lineLimit(1)
        Spacer(minLength: 0)
        Button { session.activity.open(activity) } label: {
          Text(EchoCopy.string("Join"))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(EchoTheme.Color.ink(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .background(EchoTheme.Color.ink(0.04))
    }
  }
}

/// Title bar shared by every activity surface (back to the voice grid + trailing actions).
struct EchoActivityHeader<Trailing: View>: View {
  let title: String
  let onClose: () -> Void
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 10) {
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
          .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close activity"))
      Text(title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 0)
      trailing()
    }
    .padding(.horizontal, 12)
    .frame(height: 40)
    .overlay(alignment: .bottom) { Divider().overlay(EchoTheme.Color.ink(0.08)) }
  }
}

extension EchoActivityHeader where Trailing == EmptyView {
  init(title: String, onClose: @escaping () -> Void) {
    self.init(title: title, onClose: onClose) { EmptyView() }
  }
}
