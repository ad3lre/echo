import SwiftUI
import UniformTypeIdentifiers

extension EchoMessageComposer {
  @discardableResult
  func attachImageData(_ data: Data, filename: String, mimeType: String) -> Bool {
    guard state.remainingCapacity > 0 else {
      state.errorMessage = EchoCopy.string("You can attach up to 10 files.")
      return false
    }
    guard !data.isEmpty else {
      state.errorMessage = EchoCopy.string("Couldn’t attach that image.")
      return false
    }
    let normalized = EchoComposerImageUploadNormalize.jpegCompatibleUpload(
      data: data, filename: filename, mimeType: mimeType)
    state.poll = nil
    state.selectedGIF = nil
    state.assets.append(
      EchoComposerAsset(
        data: normalized.data,
        filename: normalized.filename,
        mimeType: normalized.mimeType,
        kind: "image"))
    return true
  }

  #if os(macOS)
    @MainActor
    func ingestDropProviders(_ providers: [NSItemProvider]) async {
      var attached = 0
      for provider in providers {
        if state.remainingCapacity <= 0 {
          state.errorMessage = EchoCopy.string("You can attach up to 10 files.")
          break
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
          let url = await loadDropFileURL(from: provider)
        {
          let hasAccess = url.startAccessingSecurityScopedResource()
          defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
          let type = UTType(filenameExtension: url.pathExtension)
          guard type?.conforms(to: .image) == true,
            let data = try? Data(contentsOf: url),
            attachImageData(
              data,
              filename: url.lastPathComponent,
              mimeType: type?.preferredMIMEType ?? "image/jpeg")
          else { continue }
          attached += 1
          continue
        }
        if let data = await loadDropImageData(from: provider),
          attachImageData(data, filename: "Dropped.jpg", mimeType: "image/jpeg")
        {
          attached += 1
        }
      }
      if attached == 0, state.errorMessage == nil {
        state.errorMessage = EchoCopy.string("Couldn’t attach that image.")
      }
    }

    private func loadDropFileURL(from provider: NSItemProvider) async -> URL? {
      await withCheckedContinuation { continuation in
        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) {
          item, _ in
          let url = (item as? URL) ?? (item as? NSURL) as URL?
          continuation.resume(returning: url)
        }
      }
    }

    private func loadDropImageData(from provider: NSItemProvider) async -> Data? {
      await withCheckedContinuation { continuation in
        provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) {
          data, _ in
          continuation.resume(returning: data)
        }
      }
    }
  #endif
}
