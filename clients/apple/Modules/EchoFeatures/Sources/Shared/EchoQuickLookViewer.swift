import SwiftUI
import UniformTypeIdentifiers

#if os(iOS)
  import QuickLook
#else
  import QuickLookUI
#endif

/// Identifiable wrapper so `.sheet(item:)` can present a resolved document URL.
struct EchoDocumentPreviewItem: Identifiable, Equatable {
  let url: URL
  let title: String
  let filename: String?
  let mimeType: String?
  var id: URL { url }
}

/// Downloads a document to a temp file whose name keeps its extension, which Quick Look
/// needs to pick a previewer (DOCX / XLSX / PPTX / Pages / CSV / …).
enum EchoDocumentDownload {
  /// Hard cap so a hostile link cannot fill the disk.
  static let maxBytes = 100 * 1024 * 1024
  private static let folder = "EchoDocumentPreview"

  static func localName(filename: String?, mimeType: String?, remote: URL) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._- "))
    var name = (filename ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if name.isEmpty, remote.lastPathComponent != "/" { name = remote.lastPathComponent }
    name = String(
      name.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "_" }.prefix(120))
    name = name.trimmingCharacters(in: CharacterSet(charactersIn: ". "))
    if name.isEmpty { name = "Document" }
    if (name as NSString).pathExtension.isEmpty {
      let urlExtension = remote.pathExtension
      let mimeExtension = mimeType.flatMap { UTType(mimeType: $0)?.preferredFilenameExtension }
      if let ext = urlExtension.isEmpty ? mimeExtension : urlExtension { name += ".\(ext)" }
    }
    return name
  }

  static func download(_ remote: URL, name: String) async throws -> URL {
    let (temp, response) = try await URLSession.shared.download(from: remote)
    defer { try? FileManager.default.removeItem(at: temp) }
    guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true
    else { throw URLError(.badServerResponse) }
    let attributes = try FileManager.default.attributesOfItem(atPath: temp.path)
    let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
    guard size > 0, size <= maxBytes else { throw URLError(.dataLengthExceedsMaximum) }
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(folder, isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent(name, isDirectory: false)
    try FileManager.default.moveItem(at: temp, to: destination)
    return destination
  }

  static func remove(_ file: URL) {
    try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
  }
}

/// In-app preview for non-PDF documents via Quick Look (`QLPreviewController` on iOS,
/// `QLPreviewView` on macOS). Downloads the signed URL once, then previews the local copy.
struct EchoDocumentViewer: View {
  let item: EchoDocumentPreviewItem
  var onClose: () -> Void
  @Environment(\.openURL) private var openURL
  @State private var fileURL: URL?
  @State private var failed = false

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider().overlay(EchoTheme.Color.ink(0.08))
      content
    }
    .background(EchoTheme.Color.canvas.ignoresSafeArea())
    #if os(macOS)
      .frame(minWidth: 520, idealWidth: 720, minHeight: 640, idealHeight: 820)
    #endif
    .task { await load() }
    .onDisappear { if let fileURL { EchoDocumentDownload.remove(fileURL) } }
  }

  private var header: some View {
    HStack(spacing: 10) {
      Text(item.title)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 0)
      if let fileURL {
        ShareLink(item: fileURL) {
          Image(systemName: "square.and.arrow.up")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.7))
            .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Share"))
      }
      Button { openURL(item.url) } label: {
        Image(systemName: "arrow.up.right.square")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
          .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Open in browser"))
      Button(action: onClose) {
        Text(EchoCopy.string("Done"))
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 16)
    .frame(height: 48)
  }

  @ViewBuilder
  private var content: some View {
    if let fileURL {
      EchoQuickLookView(fileURL: fileURL, title: item.title)
    } else if failed {
      VStack(spacing: 10) {
        Image(systemName: "doc.badge.ellipsis")
          .font(.system(size: 34, weight: .light))
          .foregroundStyle(EchoTheme.Color.ink(0.4))
        Text(EchoCopy.string("That document couldn’t be previewed."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.6))
        Button(EchoCopy.string("Open in browser")) { openURL(item.url) }
          .buttonStyle(.plain)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func load() async {
    let name = EchoDocumentDownload.localName(
      filename: item.filename, mimeType: item.mimeType, remote: item.url)
    do {
      fileURL = try await EchoDocumentDownload.download(item.url, name: name)
    } catch {
      failed = true
    }
  }
}

#if os(iOS)
  private struct EchoQuickLookView: UIViewControllerRepresentable {
    let fileURL: URL
    let title: String

    func makeCoordinator() -> Coordinator { Coordinator(fileURL: fileURL, title: title) }

    func makeUIViewController(context: Context) -> QLPreviewController {
      let controller = QLPreviewController()
      controller.dataSource = context.coordinator
      return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
      guard context.coordinator.fileURL != fileURL else { return }
      context.coordinator.fileURL = fileURL
      controller.reloadData()
    }

    @MainActor
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
      var fileURL: URL
      let title: String
      init(fileURL: URL, title: String) {
        self.fileURL = fileURL
        self.title = title
      }

      func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

      func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
        -> QLPreviewItem
      {
        EchoQuickLookItem(url: fileURL, title: title)
      }
    }
  }

  private final class EchoQuickLookItem: NSObject, QLPreviewItem {
    let previewItemURL: URL?
    let previewItemTitle: String?
    init(url: URL, title: String) {
      previewItemURL = url
      previewItemTitle = title
    }
  }
#else
  private struct EchoQuickLookView: NSViewRepresentable {
    let fileURL: URL
    let title: String

    func makeNSView(context: Context) -> QLPreviewView {
      let view = QLPreviewView(frame: .zero, style: .normal) ?? QLPreviewView()
      view.autostarts = true
      view.previewItem = fileURL as NSURL
      return view
    }

    func updateNSView(_ view: QLPreviewView, context: Context) {
      if (view.previewItem as? NSURL) as URL? != fileURL { view.previewItem = fileURL as NSURL }
    }

    static func dismantleNSView(_ view: QLPreviewView, coordinator: ()) { view.close() }
  }
#endif
