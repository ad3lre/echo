import EchoNetworking
import ImageIO
import SwiftUI

#if os(iOS)
  import UIKit
#else
  import AppKit
#endif

/// Web-style pending attachment strip: real image/GIF thumbnails with remove controls.
struct EchoComposerPendingPreview: View {
  let assets: [EchoComposerAsset]
  let gif: EchoGIF?
  let baseURL: URL
  let accessToken: String
  let onRemoveAsset: (UUID) -> Void
  let onRemoveGIF: () -> Void

  var body: some View {
    if !assets.isEmpty || gif != nil {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(assets) { asset in
            if asset.isVisual {
              visualTile(asset)
            } else {
              documentTile(asset)
            }
          }
          if let gif {
            gifTile(gif)
          }
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.string("Pending attachments"))
    }
  }

  private func visualTile(_ asset: EchoComposerAsset) -> some View {
    ZStack(alignment: .topTrailing) {
      EchoComposerLocalThumb(data: asset.data, fallbackSystemImage: documentIcon(for: asset))
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(EchoTheme.Color.ink(0.10), lineWidth: 1)
        }
      removeButton(EchoCopy.format("Remove %@", asset.filename)) {
        onRemoveAsset(asset.id)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(asset.filename)
  }

  private func gifTile(_ gif: EchoGIF) -> some View {
    ZStack(alignment: .topTrailing) {
      EchoMediaImage(
        source: gif.thumbnailURL.isEmpty ? gif.url : gif.thumbnailURL,
        baseURL: baseURL,
        accessToken: accessToken
      ) {
        Rectangle().fill(EchoTheme.Color.ink(0.06))
      }
      .scaledToFill()
      .frame(width: 64, height: 64)
      .clipped()
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.10), lineWidth: 1)
      }
      .overlay(alignment: .bottomLeading) {
        Text(EchoCopy.string("GIF"))
          .font(.system(size: 9, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.onAccent)
          .padding(.horizontal, 5)
          .padding(.vertical, 2)
          .background(.black.opacity(0.55), in: Capsule())
          .padding(5)
      }
      removeButton(
        EchoCopy.format("Remove %@", gif.title.isEmpty ? EchoCopy.string("GIF") : gif.title)
      ) {
        onRemoveGIF()
      }
    }
  }

  private func documentTile(_ asset: EchoComposerAsset) -> some View {
    HStack(spacing: 8) {
      Image(systemName: documentIcon(for: asset))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.indigoSoft)
        .frame(width: 28, height: 28)
        .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      Text(asset.filename)
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.84))
        .lineLimit(1)
        .frame(maxWidth: 120, alignment: .leading)
      Button {
        onRemoveAsset(asset.id)
      } label: {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 16))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Remove %@", asset.filename))
    }
    .padding(.leading, 8)
    .padding(.trailing, 8)
    .padding(.vertical, 10)
    .frame(height: 64)
    .background(EchoTheme.Color.ink(0.065), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
  }

  private func removeButton(_ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(EchoTheme.Color.onAccent)
        .frame(width: 20, height: 20)
        .background(.black.opacity(0.72), in: Circle())
        .overlay { Circle().stroke(EchoTheme.Color.ink(0.22), lineWidth: 1) }
    }
    .buttonStyle(.plain)
    .padding(5)
    .accessibilityLabel(label)
  }

  private func documentIcon(for asset: EchoComposerAsset) -> String {
    if asset.kind == "audio" || asset.mimeType.hasPrefix("audio/") { return "waveform" }
    if asset.kind == "video" || asset.mimeType.hasPrefix("video/") { return "film" }
    return "doc.fill"
  }
}

private struct EchoComposerLocalThumb: View {
  let data: Data
  var fallbackSystemImage = "photo.fill"
  @State private var image: EchoPlatformImage?
  @State private var didFail = false

  var body: some View {
    GeometryReader { geo in
      ZStack {
        Rectangle().fill(EchoTheme.Color.ink(0.055))
        if let image {
          #if os(iOS)
            Image(uiImage: image)
              .resizable()
              .scaledToFill()
              .frame(width: geo.size.width, height: geo.size.height)
              .clipped()
          #else
            Image(nsImage: image)
              .resizable()
              .scaledToFill()
              .frame(width: geo.size.width, height: geo.size.height)
              .clipped()
          #endif
        } else if didFail {
          Image(systemName: fallbackSystemImage)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        } else {
          ProgressView().controlSize(.small).tint(EchoTheme.Color.ink(0.42))
        }
      }
    }
    .task(id: data.count) {
      let made = await Task.detached(priority: .userInitiated) {
        EchoComposerThumbnailMaker.make(from: data, maxPixel: 256)
      }.value
      image = made
      didFail = made == nil
    }
  }
}

enum EchoComposerThumbnailMaker {
  static func make(from data: Data, maxPixel: CGFloat) -> EchoPlatformImage? {
    let options: [CFString: Any] = [
      kCGImageSourceShouldCache: false
    ]
    guard let source = CGImageSourceCreateWithData(data as CFData, options as CFDictionary) else {
      return nil
    }
    let thumbOptions: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: Int(maxPixel),
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard
      let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary)
    else {
      return nil
    }
    #if os(iOS)
      return UIImage(cgImage: cgImage)
    #else
      return NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
    #endif
  }
}
