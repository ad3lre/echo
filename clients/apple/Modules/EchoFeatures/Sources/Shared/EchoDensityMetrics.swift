import CoreGraphics
import Foundation

/// Interface density tokens mirrored from web `density.scss` (16pt rem base).
struct EchoDensityMetrics: Equatable, Sendable {
  var channelRowPaddingY: CGFloat
  var channelRowPaddingX: CGFloat
  var dmRowPaddingY: CGFloat
  var dmRowPaddingX: CGFloat
  var dmInboxGap: CGFloat
  var settingsTogglePad: CGFloat
  var msgHeaderMarginTop: CGFloat
  var msgHeaderFirstMarginTop: CGFloat
  var msgHeaderPaddingY: CGFloat
  var msgContinuationPaddingY: CGFloat
  var msgLastMarginBottom: CGFloat

  static let comfortable = EchoDensityMetrics(
    channelRowPaddingY: 6,
    channelRowPaddingX: 10,
    dmRowPaddingY: 10,
    dmRowPaddingX: 12,
    dmInboxGap: 4,
    settingsTogglePad: 16,
    msgHeaderMarginTop: 17,
    msgHeaderFirstMarginTop: 24,
    msgHeaderPaddingY: 4,
    msgContinuationPaddingY: 1,
    msgLastMarginBottom: 16
  )

  static let compact = EchoDensityMetrics(
    channelRowPaddingY: 4,
    channelRowPaddingX: 8,
    dmRowPaddingY: 8,
    dmRowPaddingX: 10,
    dmInboxGap: 2,
    settingsTogglePad: 12,
    msgHeaderMarginTop: 13,
    msgHeaderFirstMarginTop: 18,
    msgHeaderPaddingY: 3,
    msgContinuationPaddingY: 1,
    msgLastMarginBottom: 12
  )

  static let spacious = EchoDensityMetrics(
    channelRowPaddingY: 8,
    channelRowPaddingX: 12,
    dmRowPaddingY: 12,
    dmRowPaddingX: 14,
    dmInboxGap: 6,
    settingsTogglePad: 18,
    msgHeaderMarginTop: 20,
    msgHeaderFirstMarginTop: 28,
    msgHeaderPaddingY: 5,
    msgContinuationPaddingY: 2,
    msgLastMarginBottom: 20
  )

  /// Message-spacing OFF overrides (`accessibility.scss`), regardless of density.
  static let tightMessageSpacing = (
    headerMarginTop: CGFloat(8),
    continuationPaddingY: CGFloat(0.5)
  )

  static func metrics(for densityID: String) -> EchoDensityMetrics {
    switch densityID.lowercased() {
    case "compact": return .compact
    case "spacious": return .spacious
    default: return .comfortable
    }
  }

  func messageHeaderTop(showsHeader: Bool, messageSpacing: Bool) -> CGFloat {
    if !messageSpacing {
      return showsHeader
        ? Self.tightMessageSpacing.headerMarginTop : Self.tightMessageSpacing.continuationPaddingY
    }
    return showsHeader ? msgHeaderMarginTop : msgContinuationPaddingY
  }

  func messageBottom(showsHeader: Bool, messageSpacing: Bool) -> CGFloat {
    if !messageSpacing {
      return showsHeader ? 4 : Self.tightMessageSpacing.continuationPaddingY
    }
    return showsHeader ? msgHeaderPaddingY + 1 : msgContinuationPaddingY + 1
  }
}
