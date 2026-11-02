import EchoDomain
import SwiftUI

extension EchoServerChannelsView {
  /// Forum channel selected → hub (post list), not plain chat.
  func forumHubSurface(_ launch: EchoGuildChatLaunch, onExit: (() -> Void)?) -> some View {
    EchoForumHubHost(
      server: launch.server,
      forum: launch.channel,
      servers: model,
      onOpenPost: { post in openForumPost(id: post.id, title: post.title, forum: launch.channel) },
      onOpenCreated: { channelID in
        openForumPost(id: channelID, title: nil, forum: launch.channel)
      },
      onRequestExit: onExit
    )
    .id(launch.channel.id)
  }

  /// Post → child text channel in the shared guild conversation surface.
  func openForumPost(id: String, title: String?, forum: EchoGuildChannel) {
    let channel =
      model.channels(for: server.id).first(where: { $0.id == id })
      ?? EchoGuildChannel(
        id: id,
        name: title ?? EchoCopy.string("Post"),
        type: "text",
        categoryID: forum.categoryID,
        categoryName: forum.categoryName,
        categoryPosition: forum.categoryPosition,
        position: forum.position,
        parentChannelID: forum.id
      )
    withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
      selectedGuildChat = EchoGuildChatLaunch(server: server, channel: channel)
      chatFocused = true
    }
  }

  /// Back from a post conversation to its forum hub.
  func returnToForumHub(from channel: EchoGuildChannel) {
    guard let forumID = channel.parentChannelID,
      let forum = model.channels(for: server.id).first(where: { $0.id == forumID })
    else { return }
    withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.86)) {
      selectedGuildChat = EchoGuildChatLaunch(server: server, channel: forum)
      chatFocused = true
    }
  }

  func forumBackBar(for channel: EchoGuildChannel) -> some View {
    let forumName =
      model.channels(for: server.id).first(where: { $0.id == channel.parentChannelID })?.name
      ?? EchoCopy.string("Forum")
    return Button {
      returnToForumHub(from: channel)
    } label: {
      HStack(spacing: 6) {
        Image(systemName: "chevron.left").font(.system(size: 12, weight: .bold))
        Text(EchoCopy.format("Back to %@", forumName))
          .font(.system(size: 13, weight: .semibold, design: .rounded))
        Spacer(minLength: 0)
      }
      .foregroundStyle(EchoTheme.Color.ink(0.72))
      .padding(.horizontal, 14)
      .frame(height: 34)
      .frame(maxWidth: .infinity)
      .background(EchoTheme.Color.canvas)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("Back to %@", forumName))
  }
}
