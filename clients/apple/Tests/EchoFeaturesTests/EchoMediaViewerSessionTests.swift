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
}
