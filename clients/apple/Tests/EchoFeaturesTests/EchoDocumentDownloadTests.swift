import Foundation
import Testing

@testable import EchoFeatures

struct EchoDocumentDownloadTests {
  private let remote = URL(string: "https://cdn.example.com/v1/o/abc123")!

  @Test func keepsTheOriginalExtensionSoQuickLookPicksAPreviewer() {
    #expect(
      EchoDocumentDownload.localName(filename: "Q3 Report.docx", mimeType: nil, remote: remote)
        == "Q3 Report.docx")
  }

  @Test func addsAnExtensionFromTheMimeTypeWhenTheNameHasNone() {
    let docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    #expect(
      EchoDocumentDownload.localName(filename: "Minutes", mimeType: docx, remote: remote)
        == "Minutes.docx")
    let sheet = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    #expect(
      EchoDocumentDownload.localName(filename: nil, mimeType: sheet, remote: remote)
        == "abc123.xlsx")
  }

  @Test func neverEscapesTheTempFolder() {
    let name = EchoDocumentDownload.localName(
      filename: "../../etc/passwd.pptx", mimeType: nil, remote: remote)
    #expect(!name.contains("/") && name.hasSuffix(".pptx"))
    #expect(
      EchoDocumentDownload.localName(filename: "  ", mimeType: nil, remote: URL(string: "https://x.test/")!)
        == "Document")
  }
}
