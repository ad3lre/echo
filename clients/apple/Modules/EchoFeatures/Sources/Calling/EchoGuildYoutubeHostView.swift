import SwiftUI

/// YouTube host mode: search, queue, and the controllable player. Everything the
/// player does is published over LiveKit (`youtube_activity` + `ytPlayback`) by
/// `EchoGuildActivityController` so peers mirror it in follower mode.
struct EchoGuildYoutubeHostView: View {
  var controller: EchoGuildActivityController
  @State private var query = ""

  var body: some View {
    VStack(spacing: 0) {
      EchoActivityHeader(title: "YouTube", onClose: controller.close)
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 14) {
          player
          searchField
          if let error = controller.searchError {
            Text(error)
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.52))
          }
          if !controller.results.isEmpty { section(EchoCopy.string("Results"), rows: results) }
          if !controller.playlist.isEmpty { section(EchoCopy.string("Queue"), rows: queue) }
        }
        .padding(16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder
  private var player: some View {
    if let entry = controller.nowPlaying {
      VStack(alignment: .leading, spacing: 8) {
        EchoYoutubeHostPlayerView(
          videoID: entry.id,
          onSample: { controller.reportPlayback(playing: $0, time: $1) },
          onEnded: controller.videoEnded
        )
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .frame(maxWidth: 560)
        HStack(spacing: 10) {
          VStack(alignment: .leading, spacing: 2) {
            Text(entry.title)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
              .lineLimit(2)
            Text(entry.channelTitle)
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.52))
              .lineLimit(1)
          }
          Spacer(minLength: 0)
          transport(icon: "backward.fill", label: EchoCopy.string("Previous")) { controller.previous() }
            .disabled(controller.currentIndex == 0)
          transport(icon: "forward.fill", label: EchoCopy.string("Next")) { controller.next() }
            .disabled(controller.currentIndex + 1 >= controller.playlist.count)
        }
      }
    } else {
      Text(EchoCopy.string("Search for a video to start watching together."))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
    }
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").foregroundStyle(EchoTheme.Color.ink(0.5))
      TextField(EchoCopy.string("Search YouTube"), text: $query)
        .textFieldStyle(.plain)
        .submitLabel(.search)
        .onSubmit { Task { await controller.search(query) } }
      if controller.isSearching { ProgressView().controlSize(.small) }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func section(_ title: String, rows: some View) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
      rows
    }
  }

  private var results: some View {
    ForEach(controller.results, id: \.id) { entry in
      row(entry, icon: "plus.circle", label: EchoCopy.string("Add to queue")) {
        controller.enqueue(entry)
      }
    }
  }

  private var queue: some View {
    ForEach(Array(controller.playlist.enumerated()), id: \.offset) { index, entry in
      row(
        entry, icon: "minus.circle", label: EchoCopy.string("Remove"),
        highlighted: index == controller.currentIndex,
        onTap: { controller.play(at: index) }
      ) { controller.remove(at: index) }
    }
  }

  private func row(
    _ entry: EchoYoutubePlaylistEntry, icon: String, label: String, highlighted: Bool = false,
    onTap: (() -> Void)? = nil, action: @escaping () -> Void
  ) -> some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.title)
          .font(.system(size: 13, weight: highlighted ? .semibold : .regular))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(2)
        Text(entry.channelTitle)
          .font(.system(size: 11))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
      .onTapGesture { onTap?() }
      transport(icon: icon, label: label, action: action)
    }
    .padding(10)
    .background(
      EchoTheme.Color.ink(highlighted ? 0.10 : 0.04),
      in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func transport(icon: String, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.system(size: 15))
        .foregroundStyle(EchoTheme.Color.fg)
        .frame(width: 32, height: 32)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
