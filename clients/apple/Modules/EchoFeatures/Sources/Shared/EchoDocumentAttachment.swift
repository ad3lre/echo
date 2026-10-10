import EchoDomain
import SwiftUI

struct EchoDocumentAttachment: View {
  let attachment: EchoMessageAttachment
  let baseURL: URL
  let accessToken: String?
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(\.openURL) private var openURL
  @State private var isOpening = false
  @State private var failed = false

  var body: some View {
    Button {
      Task {
        isOpening = true
        defer { isOpening = false }
        guard let url = await EchoMediaURLResolver.resolve(
          source: attachment.url, baseURL: baseURL, storageKey: attachment.storageKey,
          accessToken: accessToken, auth: auth),
          EchoURLPolicy.isAllowedMediaURL(url, apiBaseURL: baseURL)
        else { failed = true; return }
        openURL(url) { accepted in failed = !accepted }
      }
    } label: {
      HStack(spacing: 9) {
        if isOpening { ProgressView() } else { Image(systemName: "doc.fill") }
        VStack(alignment: .leading, spacing: 2) {
          Text(attachment.filename ?? EchoCopy.string("Attachment"))
            .font(.system(size: 13, weight: .medium, design: .rounded))
          if let mimeType = attachment.mimeType {
            Text(mimeType).font(.system(size: 11, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
          }
        }
        Image(systemName: "arrow.up.right.square")
      }
      .foregroundStyle(EchoTheme.Color.ink(0.78))
      .padding(.horizontal, 12).padding(.vertical, 10)
      .background(EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
    .buttonStyle(.plain).disabled(isOpening)
    .alert(EchoCopy.string("Couldn’t continue"), isPresented: $failed) {
      Button(EchoCopy.string("OK"), role: .cancel) {}
    } message: { EchoCopy.text("That attachment couldn’t be opened.") }
  }
}
