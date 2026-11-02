import CoreGraphics
import EchoDomain
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

enum EchoSettingsRoute: String, CaseIterable, Hashable, Identifiable {
  case account = "Account"
  case friends = "Friends"
  case notifications = "Notifications"
  case sounds = "Sounds"
  case dataPrivacy = "Data & Privacy"
  case encryptionDevices = "Encryption devices"
  case discord = "Discord"
  case google = "Google"
  case youtube = "YouTube"
  case style = "Style"
  case accessibility = "Accessibility"
  case voiceVideo = "Voice & Video"
  case timeLanguage = "Time & Language"
  case keybinds = "Keybinds"
  case advanced = "Advanced"
  case echoPlus = "Echo+"
  case subscriptions = "Subscriptions"
  case termsPolicies = "Terms & policies"
  case reportAbuse = "Report abuse"
  case formattingGuide = "Formatting guide"

  var id: Self { self }
  var title: String { EchoCopy.string(key: rawValue) }

  /// Stable API provider id for external OAuth routes (never localized title).
  var externalProviderID: String? {
    switch self {
    case .discord: "discord"
    case .google: "google"
    case .youtube: "youtube"
    default: nil
    }
  }
}

struct EchoSettingsSection: Identifiable {
  let title: String
  let rows: [EchoSettingsRow]
  var id: String { title }
}

struct EchoSettingsRow: Identifiable {
  let route: EchoSettingsRoute
  let subtitle: String
  let icon: String
  let tint: Color
  var id: EchoSettingsRoute { route }
  var title: String { route.title }
}

struct EchoSettingsRowView: View {
  let row: EchoSettingsRow
  let baseURL: URL
  let accessToken: String
  let profile: EchoUserProfile?
  let onSignOut: () -> Void

  var body: some View {
    NavigationLink {
      EchoSettingDetailView(
        route: row.route, icon: row.icon, tint: row.tint, baseURL: baseURL,
        accessToken: accessToken, onSignOut: onSignOut)
    } label: {
      HStack(spacing: 13) {
        EchoSettingsBrandIcon(row: row)
          .frame(width: 34, height: 34)
          .background(
            row.tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(row.title).font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
          Text(row.subtitle).font(.system(size: 12, design: .rounded)).foregroundStyle(
            EchoTheme.Color.ink(0.42)
          ).lineLimit(1)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(
          EchoTheme.Color.ink(0.28))
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

struct EchoSettingsBrandIcon: View {
  let row: EchoSettingsRow
  /// Compact mark for desktop sidebar nav (web settings-nav-item__icon).
  var compact = false

  var body: some View {
    Group {
      switch row.route {
      case .discord:
        EchoBrandImage(name: "Discord", template: true)
          .padding(compact ? 0 : 7)
          .foregroundStyle(row.tint)
      case .google:
        EchoBrandImage(name: "Google", template: false, punchWhitePlate: true)
          .padding(compact ? 0 : 2)
      default:
        Image(systemName: row.icon)
          .font(.system(size: compact ? 14 : 16, weight: .medium))
          .foregroundStyle(row.tint)
      }
    }
  }
}

/// Loads brand marks as loose PNGs from the module bundle.
/// SwiftPM copies `.xcassets` without compiling them to `Assets.car`, so
/// `Image("Name", bundle:)` would stay blank — use scaled PNGs instead.
private struct EchoBrandImage: View {
  let name: String
  var template: Bool = false
  var punchWhitePlate: Bool = false

  var body: some View {
    image
      .resizable()
      .scaledToFit()
  }

  private var image: Image {
    #if canImport(UIKit)
      if let ui = UIImage(named: name, in: .module, compatibleWith: nil) {
        let source = punchWhitePlate ? ui.echoPunchingNearWhite() : ui
        let rendered = source.withRenderingMode(template ? .alwaysTemplate : .alwaysOriginal)
        return Image(uiImage: rendered)
      }
      return Image(systemName: "app.fill")
    #elseif canImport(AppKit)
      if let ns = Bundle.module.image(forResource: name) {
        let source = punchWhitePlate ? ns.echoPunchingNearWhite() : ns
        let image = Image(nsImage: source)
        return template ? image.renderingMode(.template) : image.renderingMode(.original)
      }
      return Image(systemName: "app.fill")
    #else
      return Image(systemName: "app.fill")
    #endif
  }
}

#if canImport(UIKit)
  extension UIImage {
    fileprivate func echoPunchingNearWhite() -> UIImage {
      guard let cg = cgImage else { return self }
      guard let punched = cg.echoPunchingNearWhite() else { return self }
      return UIImage(cgImage: punched, scale: scale, orientation: imageOrientation)
    }
  }
#elseif canImport(AppKit)
  extension NSImage {
    fileprivate func echoPunchingNearWhite() -> NSImage {
      var rect = CGRect(origin: .zero, size: size)
      guard let cg = cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        return self
      }
      guard let punched = cg.echoPunchingNearWhite() else { return self }
      return NSImage(cgImage: punched, size: size)
    }
  }
#endif

extension CGImage {
  fileprivate func echoPunchingNearWhite() -> CGImage? {
    let width = self.width
    let height = self.height
    let bytesPerPixel = 4
    let bytesPerRow = width * bytesPerPixel
    var data = Data(count: height * bytesPerRow)
    let drawn = data.withUnsafeMutableBytes { raw -> Bool in
      guard let ptr = raw.baseAddress else { return false }
      guard
        let ctx = CGContext(
          data: ptr,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: bytesPerRow,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
      else { return false }
      ctx.draw(self, in: CGRect(x: 0, y: 0, width: width, height: height))
      let buf = ptr.bindMemory(to: UInt8.self, capacity: width * height * bytesPerPixel)
      for i in 0..<(width * height) {
        let offset = i * bytesPerPixel
        if buf[offset] > 240, buf[offset + 1] > 240, buf[offset + 2] > 240 {
          buf[offset + 3] = 0
        }
      }
      return true
    }
    guard drawn else { return nil }
    return data.withUnsafeMutableBytes { raw in
      guard let ptr = raw.baseAddress else { return nil }
      guard
        let ctx = CGContext(
          data: ptr,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: bytesPerRow,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
      else { return nil }
      return ctx.makeImage()
    }
  }
}

