import SwiftUI
import UniformTypeIdentifiers

/// Web `VcWatchTogetherLobby`: pick host / viewer, then (host) build the upload queue.
struct EchoWatchTogetherChooser: View {
  var host: EchoWatchTogetherHost
  /// A peer already hosts, so hosting is not offered (web `followingRemoteHost`).
  var peerIsHosting: Bool

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 12) {
        Text(EchoCopy.string("Upload videos to a shared queue and play them in sync over voice. The host drives playback; everyone else follows automatically."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
        if host.plusRequired { plusCard }
        choice(
          title: EchoCopy.string("Host a session"),
          detail: peerIsHosting
            ? EchoCopy.string("Someone else is already hosting. Join as a viewer instead.")
            : EchoCopy.string("Upload videos and control playback for the channel."),
          symbol: "play.rectangle.on.rectangle.fill", busy: host.isClaiming
        ) { Task { await host.chooseHost() } }
        .disabled(peerIsHosting || host.isClaiming || !host.canHost)
        choice(
          title: EchoCopy.string("Join & wait"),
          detail: EchoCopy.string("Follow someone else’s session when they start."),
          symbol: "person.2.fill", busy: false
        ) { host.chooseFollower() }
        if let error = host.errorMessage { EchoWatchTogetherNote(text: error, isError: true) }
      }
      .padding(16)
      .frame(maxWidth: 560, alignment: .leading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }

  private var plusCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(EchoCopy.string("Echo+ required"))
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(EchoCopy.string("Hosting Watch Together uploads requires Echo+. You can still join as a viewer when someone else hosts."))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.6))
      Button { host.chooseFollower() } label: {
        Text(EchoCopy.string("Switch to viewer"))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
      }
      .buttonStyle(.plain)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private func choice(
    title: String, detail: String, symbol: String, busy: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: symbol).font(.system(size: 20)).frame(width: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 14, weight: .semibold))
          Text(detail)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .multilineTextAlignment(.leading)
        }
        Spacer(minLength: 0)
        if busy { ProgressView().controlSize(.small) }
      }
      .foregroundStyle(EchoTheme.Color.fg)
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

/// Host lobby: add videos (file picker or earlier uploads), wait for transcodes, start.
struct EchoWatchTogetherLobby: View {
  var host: EchoWatchTogetherHost
  @State private var importing = false

  private static let videoTypes: [UTType] =
    [.movie] + ["mkv", "webm"].compactMap { UTType(filenameExtension: $0) }

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        Text(sessionBytesLabel)
          .font(.system(size: 11))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        addVideo
        if let error = host.errorMessage { EchoWatchTogetherNote(text: error, isError: true) }
        library
        queue
        startSection
      }
      .padding(16)
      .frame(maxWidth: 560, alignment: .leading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .fileImporter(
      isPresented: $importing, allowedContentTypes: Self.videoTypes, allowsMultipleSelection: false
    ) { result in
      guard case .success(let urls) = result, let url = urls.first else { return }
      Task { await host.upload(fileURL: url) }
    }
  }

  private var sessionBytesLabel: String {
    let gib = Double(1 << 30)
    return EchoCopy.format(
      "%.2f / %.0f GiB session", Double(host.sessionBytesUsed) / gib, 20.0)
  }

  private var addVideo: some View {
    VStack(alignment: .leading, spacing: 8) {
      Button { importing = true } label: {
        Label(EchoCopy.string("Add video"), systemImage: "plus.circle.fill")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 14)
          .background(
            EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(host.uploadProgress != nil)
      Text(EchoCopy.string("MP4, WebM, MKV, and more · up to 6 GiB per file"))
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.45))
      if let name = host.uploadName, let progress = host.uploadProgress {
        VStack(alignment: .leading, spacing: 4) {
          Text(EchoCopy.format("Uploading %@ · %ld%%", name, Int((progress * 100).rounded())))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.6))
            .lineLimit(1)
          ProgressView(value: progress)
        }
      }
    }
  }

  @ViewBuilder
  private var library: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(EchoCopy.string("Your uploads"))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
        Spacer(minLength: 0)
        Button { Task { await host.refreshLibrary() } } label: {
          Text(EchoCopy.string("Refresh"))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.6))
        }
        .buttonStyle(.plain)
        .disabled(host.isLoadingLibrary)
      }
      if host.isLoadingLibrary {
        EchoWatchTogetherNote(text: EchoCopy.string("Loading your upload library…"))
      } else if host.libraryAvailable.isEmpty {
        EchoWatchTogetherNote(
          text: host.library.isEmpty
            ? EchoCopy.string("Uploads you add here are saved to your library and can be reused in any voice channel.")
            : EchoCopy.string("All library videos are already in your queue."))
      } else {
        ForEach(host.libraryAvailable, id: \.storageKey) { item in
          row(
            title: item.title, status: item.transcodeStatus, error: nil,
            actionLabel: EchoCopy.string("Add"), action: { Task { await host.addFromLibrary(item) } })
        }
      }
    }
  }

  @ViewBuilder
  private var queue: some View {
    if host.playlist.isEmpty {
      EchoWatchTogetherNote(
        text: EchoCopy.string("Add at least one video to start. Each file is transcoded before playback."))
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text(EchoCopy.string("Queue"))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
        ForEach(Array(host.playlist.enumerated()), id: \.element.id) { index, entry in
          row(
            title: entry.title, status: entry.transcodeStatus, error: entry.transcodeError,
            actionLabel: EchoCopy.string("Remove"), action: { host.remove(at: index) },
            retry: entry.transcodeStatus == "failed" ? { Task { await host.retry(entry) } } : nil)
        }
      }
    }
  }

  @ViewBuilder
  private var startSection: some View {
    if !host.playlist.isEmpty, host.readyCount == 0 {
      EchoWatchTogetherNote(
        text: host.pendingCount > 0
          ? EchoCopy.format("Waiting for %ld video(s) to finish transcoding before you can start.", host.pendingCount)
          : EchoCopy.string("All videos failed transcoding. Retry or remove failed items to continue."))
    }
    if host.readyCount > 0 {
      Button { host.startSession() } label: {
        Text(
          host.pendingCount > 0
            ? EchoCopy.format("Start session (%ld ready · %ld still processing)", host.readyCount, host.pendingCount)
            : EchoCopy.format("Start session (%ld ready)", host.readyCount)
        )
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 13)
        .background(
          EchoTheme.Color.signInBlue, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
    }
  }

  private func row(
    title: String, status: String, error: String?, actionLabel: String,
    action: @escaping () -> Void, retry: (() -> Void)? = nil
  ) -> some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
        Text(Self.statusLabel(status) + (error.map { " · \($0)" } ?? ""))
          .font(.system(size: 11))
          .foregroundStyle(status == "failed" ? Color.red.opacity(0.85) : EchoTheme.Color.ink(0.5))
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let retry { pill(EchoCopy.string("Retry"), retry) }
      pill(actionLabel, action)
    }
    .padding(10)
    .background(
      EchoTheme.Color.ink(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func pill(_ label: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(EchoTheme.Color.ink(0.08), in: Capsule())
    }
    .buttonStyle(.plain)
  }

  static func statusLabel(_ status: String) -> String {
    switch status {
    case "uploading": EchoCopy.string("Uploading…")
    case "pending": EchoCopy.string("Queued for transcode")
    case "processing": EchoCopy.string("Processing…")
    case "ready": EchoCopy.string("Ready")
    case "failed": EchoCopy.string("Failed")
    default: status
    }
  }
}

struct EchoWatchTogetherNote: View {
  let text: String
  var isError = false

  var body: some View {
    Text(text)
      .font(.system(size: 12))
      .foregroundStyle(isError ? Color.red.opacity(0.85) : EchoTheme.Color.ink(0.5))
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
