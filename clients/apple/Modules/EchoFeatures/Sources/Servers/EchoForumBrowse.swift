import EchoDomain
import Foundation

/// Forum hub browse helpers (web `AppLayoutForumSection` search + view mode).
enum EchoForumBrowse {
  enum ViewMode: String, CaseIterable, Identifiable {
    case list
    case grid
    var id: String { rawValue }
  }

  /// Client-side filter on title + last preview (web `visiblePosts`).
  static func filtered(_ posts: [EchoForumPost], query: String) -> [EchoForumPost] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !q.isEmpty else { return posts }
    return posts.filter { post in
      post.title.lowercased().contains(q) || post.lastMessagePreview.lowercased().contains(q)
    }
  }
}
