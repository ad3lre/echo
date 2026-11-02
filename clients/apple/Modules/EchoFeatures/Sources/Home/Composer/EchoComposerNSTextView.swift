#if os(macOS)
  import AppKit
  import UniformTypeIdentifiers

  /// Captures image paste / file drops that NSTextView would otherwise ignore.
  final class EchoComposerNSTextView: NSTextView {
    var onPasteImage: ((Data, String, String) -> Bool)?

    override func paste(_ sender: Any?) {
      if Self.consumeImage(from: NSPasteboard.general, using: onPasteImage) { return }
      super.paste(sender)
    }

    override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
      if Self.consumeImage(from: sender.draggingPasteboard, using: onPasteImage) {
        return true
      }
      return super.performDragOperation(sender)
    }

    private static func consumeImage(
      from pasteboard: NSPasteboard,
      using handler: ((Data, String, String) -> Bool)?
    ) -> Bool {
      guard let handler else { return false }
      if let urls = pasteboard.readObjects(forClasses: [NSURL.self]) as? [URL] {
        for url in urls {
          let hasAccess = url.startAccessingSecurityScopedResource()
          defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
          guard let data = try? Data(contentsOf: url), !data.isEmpty else { continue }
          let type = UTType(filenameExtension: url.pathExtension)
          guard type?.conforms(to: .image) == true else { continue }
          let mime = type?.preferredMIMEType ?? "image/jpeg"
          if handler(data, url.lastPathComponent, mime) { return true }
        }
      }
      if let image = NSImage(pasteboard: pasteboard),
        let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
      {
        return handler(jpeg, "Pasted.jpg", "image/jpeg")
      }
      return false
    }
  }
#endif
