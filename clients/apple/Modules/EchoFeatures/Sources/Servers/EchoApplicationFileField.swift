import EchoDomain
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Bytes + metadata for a file the member picked (Files app / photo library).
struct EchoPickedFile {
  let data: Data
  let filename: String
  let mimeType: String

  static func load(from url: URL) -> EchoPickedFile? {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
    let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
    return EchoPickedFile(
      data: data, filename: url.lastPathComponent, mimeType: mime ?? "application/octet-stream")
  }

  static func load(from item: PhotosPickerItem) async -> EchoPickedFile? {
    guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
    let type = item.supportedContentTypes.first
    let ext = type?.preferredFilenameExtension ?? "jpg"
    return EchoPickedFile(
      data: data, filename: "photo.\(ext)", mimeType: type?.preferredMIMEType ?? "image/jpeg")
  }
}

/// `attachment` question input — choose a file or photo and upload it before submitting.
struct EchoApplicationFileField: View {
  let question: EchoApplicationQuestion
  let title: String
  let current: EchoApplicationUpload?
  let isUploading: Bool
  /// Uploads the picked file; returns a message to show inline on failure.
  var onPick: (EchoPickedFile) async -> String?
  var onClear: () -> Void

  @State private var importing = false
  @State private var photoItem: PhotosPickerItem?
  @State private var errorMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      EchoDesktopLabeledField(title: title) {
        VStack(alignment: .leading, spacing: 10) {
          if let current {
            HStack(spacing: 8) {
              Image(systemName: "paperclip")
                .foregroundStyle(EchoTheme.Color.ink(0.5))
              Text(current.name)
                .lineLimit(1)
                .truncationMode(.middle)
              Spacer(minLength: 0)
              Button(EchoCopy.string("Remove"), action: onClear)
                .buttonStyle(.plain)
                .foregroundStyle(EchoTheme.Color.mentionPing)
                .disabled(isUploading)
            }
          } else if isUploading {
            HStack(spacing: 8) {
              ProgressView().controlSize(.small)
              Text(EchoCopy.string("Uploading…"))
                .foregroundStyle(EchoTheme.Color.ink(0.48))
            }
          } else {
            Text(question.placeholder.isEmpty ? EchoCopy.string("No file chosen") : question.placeholder)
              .foregroundStyle(EchoTheme.Color.ink(0.48))
          }
          HStack(spacing: 8) {
            pickerButton(EchoCopy.string("Choose file")) { importing = true }
            PhotosPicker(selection: $photoItem, matching: .images) {
              pickerLabel(EchoCopy.string("Choose photo"))
            }
            .buttonStyle(.plain)
          }
          .disabled(isUploading)
        }
      }
      if let limit = question.maxBytes {
        Text(
          EchoCopy.format(
            "Max %@", ByteCountFormatter.string(fromByteCount: Int64(limit), countStyle: .file))
        )
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      if let errorMessage {
        Text(errorMessage)
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      }
    }
    .fileImporter(isPresented: $importing, allowedContentTypes: [.item]) { result in
      guard case .success(let url) = result else { return }
      Task { await handle(EchoPickedFile.load(from: url)) }
    }
    .onChange(of: photoItem) { _, item in
      guard let item else { return }
      Task {
        await handle(await EchoPickedFile.load(from: item))
        photoItem = nil
      }
    }
  }

  private func handle(_ file: EchoPickedFile?) async {
    errorMessage = nil
    guard let file else {
      errorMessage = EchoCopy.string("Echo couldn’t read that file.")
      return
    }
    errorMessage = await onPick(file)
  }

  private func pickerButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { pickerLabel(title) }.buttonStyle(.plain)
  }
}

private func pickerLabel(_ title: String) -> some View {
  Text(title)
    .font(.system(size: 13, weight: .semibold))
    .foregroundStyle(EchoTheme.Color.ink(0.75))
    .padding(.horizontal, 12)
    .frame(height: 30)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
}
