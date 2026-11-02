import EchoDomain
import SwiftUI

/// List or grid card for one forum post (web forum section rows).
struct EchoForumPostCard: View {
  let post: EchoForumPost
  let viewMode: EchoForumBrowse.ViewMode
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    switch viewMode {
    case .list: listCard
    case .grid: gridCard
    }
  }

  private var listCard: some View {
    HStack(alignment: .top, spacing: 12) {
      coverThumb(size: 48)
      VStack(alignment: .leading, spacing: 6) {
        titleRow
        if !post.lastMessagePreview.isEmpty {
          Text(post.lastMessagePreview)
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.56))
            .lineLimit(2)
        }
        metaRow
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.06),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .opacity(post.isArchived ? 0.72 : 1)
    .echoPointerHoverFill(cornerRadius: 14)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
  }

  private var gridCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      coverHero
      VStack(alignment: .leading, spacing: 6) {
        titleRow
        if !post.lastMessagePreview.isEmpty {
          Text(post.lastMessagePreview)
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.56))
            .lineLimit(2)
        }
        metaRow
      }
      .padding(12)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.06),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .opacity(post.isArchived ? 0.72 : 1)
    .echoPointerHoverFill(cornerRadius: 14)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
  }

  private var titleRow: some View {
    HStack(spacing: 6) {
      if post.pinned {
        Image(systemName: "pin.fill")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(EchoTheme.Color.indigoSoft)
      }
      if post.locked {
        Image(systemName: "lock.fill")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      if post.isArchived {
        Image(systemName: "archivebox.fill")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      Text(post.title)
        .font(.system(size: 16, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.94))
        .lineLimit(2)
      Spacer(minLength: 0)
    }
  }

  private var metaRow: some View {
    HStack(spacing: 10) {
      Label("\(post.messageCount)", systemImage: "bubble.left")
      if let activity = post.lastActivityAt ?? post.createdAt {
        Text(activity, style: .relative)
      }
    }
    .font(.system(size: 12, weight: .medium, design: .rounded))
    .foregroundStyle(EchoTheme.Color.ink(0.42))
  }

  @ViewBuilder
  private func coverThumb(size: CGFloat) -> some View {
    if let url = post.coverImageURL?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty
    {
      EchoMediaImage(source: url, baseURL: baseURL, accessToken: accessToken) {
        coverPlaceholder
      }
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
  }

  private var coverHero: some View {
    Group {
      if let url = post.coverImageURL?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty
      {
        EchoMediaImage(source: url, baseURL: baseURL, accessToken: accessToken) {
          coverPlaceholder
        }
        .scaledToFill()
      } else {
        coverPlaceholder
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: 140)
    .clipped()
  }

  private var coverPlaceholder: some View {
    EchoTheme.Color.ink(0.08)
      .overlay {
        Image(systemName: "text.bubble")
          .font(.system(size: 22, weight: .medium))
          .foregroundStyle(EchoTheme.Color.ink(0.28))
      }
  }
}
