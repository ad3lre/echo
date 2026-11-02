import EchoDomain
import SwiftUI

/// Web `ServerNotificationSettingsModal`.
struct EchoServerNotificationModal: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var onClose: () -> Void

  @State private var level = "mentions"
  @State private var loading = true

  private let options: [(id: String, icon: String, title: String, subtitle: String)] = [
    (
      "all", "bubble.left.and.bubble.right.fill",
      EchoCopy.string("All messages"),
      EchoCopy.string("Get notified when anyone sends a message in this server.")
    ),
    (
      "mentions", "number",
      EchoCopy.string("Mentions and direct mentions"),
      EchoCopy.string(
        "Notify for @you, replies, and broadcast pings such as @everyone, @here, @channel, or role-style mentions."
      )
    ),
    (
      "mentions_direct", "person.crop.circle",
      EchoCopy.string("Direct mentions only"),
      EchoCopy.string(
        "Only when you are personally @mentioned, not via @everyone, @here, @channel, or roles."
      )
    ),
    (
      "none", "bell.slash",
      EchoCopy.string("Nothing"),
      EchoCopy.string("No push or desktop alerts from this server (still shows in the app).")
    ),
  ]

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 512, onClose: onClose) {
      VStack(alignment: .leading, spacing: 16) {
        Text(EchoCopy.string("Notification Settings"))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(
          EchoCopy.format(
            "Choose what you get from %@. This applies only to you and syncs across your devices.",
            server.name)
        )
        .font(.system(size: 14))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
        .fixedSize(horizontal: false, vertical: true)

        if loading {
          ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else {
          VStack(spacing: 8) {
            ForEach(options, id: \.id) { option in
              optionRow(option)
            }
          }
        }

        HStack {
          Spacer()
          EchoDesktopGhostButton(title: EchoCopy.string("Done"), action: onClose)
        }
        .padding(.top, 4)
      }
    }
    .task {
      level = await model.loadNotificationLevel(for: server)
      loading = false
    }
  }

  private func optionRow(
    _ option: (id: String, icon: String, title: String, subtitle: String)
  ) -> some View {
    let selected = level == option.id
    return Button {
      Task {
        level = option.id
        _ = await model.saveNotificationLevel(option.id, for: server)
      }
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: option.icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.72))
          .frame(width: 20, height: 20)
          .padding(.top, 1)
        VStack(alignment: .leading, spacing: 4) {
          Text(option.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(option.subtitle)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .background(
        selected
          ? EchoTheme.Color.signInBlue.opacity(0.16)
          : EchoTheme.Color.ink(0.045),
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
      .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}
