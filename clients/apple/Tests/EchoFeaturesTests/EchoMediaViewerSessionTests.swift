import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoMediaViewerSessionTests {
  @Test func imagesSessionClampsIndexAndFiltersNonImages() {
    let attachments = [
      EchoMessageAttachment(url: "https://a/1.png", kind: "image"),
      EchoMessageAttachment(url: "https://a/v.mp4", kind: "video"),
      EchoMessageAttachment(url: "https://a/2.gif", kind: "gif"),
    ]
    let session = EchoMediaViewerSession.images(attachments, startingAt: 9)!
    #expect(session.items.count == 2)
    #expect(session.initialIndex == 1)
    #expect(session.items.allSatisfy { $0.kind == .image })
  }

  @Test func mediaSessionIncludesVideoAndStartsOnTapTarget() {
    let video = EchoMessageAttachment(url: "https://a/v.mp4", kind: "video", filename: "clip.mp4")
    let attachments = [
      EchoMessageAttachment(url: "https://a/1.png", kind: "image"),
      video,
      EchoMessageAttachment(url: "https://a/note.pdf", kind: "document"),
    ]
    let session = EchoMediaViewerSession.media(attachments, startingAt: video)!
    #expect(session.items.count == 2)
    #expect(session.initialIndex == 1)
    #expect(session.items[1].kind == .video)
  }

  @Test func zoomClampMatchesWebBounds() {
    #expect(EchoMediaViewerZoom.clamp(0.9) == 0.9)
    #expect(EchoMediaViewerZoom.clamp(0.1) == 0.25)
    #expect(EchoMediaViewerZoom.clamp(8) == 4)
    #expect(EchoMediaViewerZoom.clamp(.nan) == EchoMediaViewerZoom.initial)
    #expect(EchoMediaViewerZoom.panThreshold > EchoMediaViewerZoom.initial)
  }

  @Test func panIsZeroUntilZoomedPastFit() {
    let viewport = CGSize(width: 800, height: 600)
    let maxAtFit = EchoMediaViewerZoom.maxPanOffset(
      viewport: viewport, zoom: EchoMediaViewerZoom.initial)
    #expect(maxAtFit == .zero)
    let maxAt2x = EchoMediaViewerZoom.maxPanOffset(viewport: viewport, zoom: 2)
    #expect(maxAt2x.width == 400)
    #expect(maxAt2x.height == 300)
  }

  @Test func clampedPanStaysInsideOverflow() {
    let viewport = CGSize(width: 800, height: 600)
    let clamped = EchoMediaViewerZoom.clampedPan(
      CGSize(width: 9999, height: -9999), viewport: viewport, zoom: 2)
    #expect(clamped.width == 400)
    #expect(clamped.height == -300)
  }
}
