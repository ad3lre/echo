import EchoDomain
import PDFKit
import SwiftUI

/// Identifiable wrapper so `.sheet(item:)` can present a resolved PDF URL.
struct EchoPDFPreviewItem: Identifiable, Equatable {
  let url: URL
  let title: String
  var id: URL { url }
}

/// In-app PDF preview (PDFKit). Downloads the signed URL once, then renders locally.
struct EchoPDFViewer: View {
  let item: EchoPDFPreviewItem
  var onClose: () -> Void
  @Environment(\.openURL) private var openURL
  @State private var document: PDFDocument?
  @State private var failed = false

  /// Hard cap so a hostile link cannot exhaust memory.
  private static let maxBytes = 64 * 1024 * 1024

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
  }

  private var header: some View {
    HStack(spacing: 10) {
      Text(item.title)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 0)
      Button {
        openURL(item.url)
      } label: {
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
    if let document {
      EchoPDFKitView(document: document)
    } else if failed {
      VStack(spacing: 10) {
        Image(systemName: "doc.badge.ellipsis")
          .font(.system(size: 34, weight: .light))
          .foregroundStyle(EchoTheme.Color.ink(0.4))
        Text(EchoCopy.string("That PDF couldn’t be previewed."))
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
    do {
      let (data, response) = try await URLSession.shared.data(from: item.url)
      guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
        data.count <= Self.maxBytes,
        let parsed = PDFDocument(data: data), parsed.pageCount > 0
      else {
        failed = true
        return
      }
      document = parsed
    } catch {
      failed = true
    }
  }
}

#if os(iOS)
  private struct EchoPDFKitView: UIViewRepresentable {
    let document: PDFDocument

    func makeUIView(context: Context) -> PDFView {
      let view = PDFView()
      view.autoScales = true
      view.displayMode = .singlePageContinuous
      view.displayDirection = .vertical
      view.document = document
      return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
      if view.document !== document { view.document = document }
    }
  }
#else
  private struct EchoPDFKitView: NSViewRepresentable {
    let document: PDFDocument

    func makeNSView(context: Context) -> PDFView {
      let view = PDFView()
      view.autoScales = true
      view.displayMode = .singlePageContinuous
      view.displayDirection = .vertical
      view.document = document
      return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
      if view.document !== document { view.document = document }
    }
  }
#endif
