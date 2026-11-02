import EchoDomain
import SwiftUI

/// Web `MessageDocumentAttachment` — accent stripe, PDF first-page thumb, filename/size.
struct EchoDocumentAttachment: View {
  let attachment: EchoMessageAttachment
  let baseURL: URL
  let accessToken: String?
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap
  @State private var isOpening = false
  @State private var failed = false
  @State private var pdfPreview: EchoPDFPreviewItem?
  @State private var documentPreview: EchoDocumentPreviewItem?

  var body: some View {
    Button {
      if consumeComposerKeyboardTap() { return }
      Task { await open() }
    } label: {
      HStack(alignment: .center, spacing: 0) {
        RoundedRectangle(cornerRadius: 1)
          .fill(attachment.isPDF ? Color.red.opacity(0.9) : Color.blue.opacity(0.9))
          .frame(width: 3)
        if attachment.isPDF {
          EchoPDFFirstPageThumbnail(
            sourceURL: attachment.url,
            baseURL: baseURL,
            storageKey: attachment.storageKey,
            accessToken: accessToken,
            spoiler: attachment.spoiler
          )
          .padding(.leading, 8)
          .padding(.vertical, 8)
        } else {
          Text(EchoCopy.string("DOC"))
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 40, height: 40)
            .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        VStack(alignment: .leading, spacing: 3) {
          Text(displayName)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.9))
            .lineLimit(1)
            .blur(radius: attachment.spoiler ? 3 : 0)
          if let sizeLabel {
            Text(sizeLabel)
              .font(.system(size: 10, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
              .blur(radius: attachment.spoiler ? 2 : 0)
          }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        if isOpening {
          ProgressView().padding(.trailing, 10)
        } else {
          Image(systemName: "eye")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
            .padding(.trailing, 10)
        }
      }
      .frame(maxWidth: attachment.isPDF ? 420 : 320, alignment: .leading)
      .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10))
      .overlay(
        RoundedRectangle(cornerRadius: 10)
          .stroke(
            attachment.spoiler
              ? Color.orange.opacity(0.7) : EchoTheme.Color.ink(0.12),
            lineWidth: attachment.spoiler ? 2 : 1)
      )
    }
    .buttonStyle(.plain)
    .disabled(isOpening)
    .onAppear { EchoChatMediaRetentionTouch.queue(attachment.storageKey) }
    .sheet(item: $pdfPreview) { item in
      EchoPDFViewer(item: item) { pdfPreview = nil }
    }
    .sheet(item: $documentPreview) { item in
      EchoDocumentViewer(item: item) { documentPreview = nil }
    }
    .alert(EchoCopy.string("Couldn’t continue"), isPresented: $failed) {
      Button(EchoCopy.string("OK"), role: .cancel) {}
    } message: { EchoCopy.text("That attachment couldn’t be opened.") }
    .accessibilityLabel(
      EchoCopy.format("Open %@", displayName))
  }

  private var displayName: String {
    let name = attachment.filename?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !name.isEmpty { return name }
    return attachment.isPDF
      ? EchoCopy.string("PDF") : EchoCopy.string("Attachment")
  }

  private var sizeLabel: String? {
    guard let fileSize = attachment.fileSize, fileSize >= 0 else { return nil }
    return ByteCountFormatter.string(fromByteCount: Int64(fileSize), countStyle: .file)
      .uppercased()
  }

  private func open() async {
    isOpening = true
    defer { isOpening = false }
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: attachment.url, baseURL: baseURL, storageKey: attachment.storageKey,
        accessToken: accessToken, auth: auth),
      EchoURLPolicy.isAllowedMediaURL(url, apiBaseURL: baseURL)
    else {
      failed = true
      return
    }
    let title = displayName
    if attachment.isPDF {
      pdfPreview = EchoPDFPreviewItem(url: url, title: title)
    } else {
      documentPreview = EchoDocumentPreviewItem(
        url: url, title: title, filename: attachment.filename, mimeType: attachment.mimeType)
    }
  }
}
