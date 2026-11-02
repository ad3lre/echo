import EchoDomain
import SwiftUI

/// Favicon + cleaned host/path label for autolinked http(s) URLs.
/// macOS: web `MessageLinkHoverPreview` on hover when embeds are available.
struct EchoMarkdownExternalLink: View {
  let url: URL
  let display: String
  var size: CGFloat = EchoTheme.Typography.messageBody
  var snippet: Bool = false
  var embeds: [EchoMessageEmbed] = []
  @Environment(\.openURL) private var openURL
  @State private var faviconFailed = false
  @State private var showingHover = false
  #if os(macOS)
    @State private var hideTask: Task<Void, Never>?
  #endif

  private var faviconURL: URL? {
    faviconFailed ? nil : EchoLinkChrome.faviconURL(for: url)
  }

  private var glyphSize: CGFloat { snippet ? 12 : 14 }

  private var matchedEmbed: EchoMessageEmbed? {
    EchoMessageLinkHoverMatching.previewEmbed(for: url, in: embeds)
  }

  var body: some View {
    Button {
      openURL(url)
    } label: {
      HStack(alignment: .center, spacing: 4) {
        if let faviconURL {
          AsyncImage(url: faviconURL) { phase in
            switch phase {
            case .success(let image):
              image.resizable().scaledToFit()
            case .failure:
              Color.clear
                .onAppear { faviconFailed = true }
            default:
              Color.clear
            }
          }
          .frame(width: glyphSize, height: glyphSize)
          .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
        }
        Text(display)
          .font(.system(size: size, weight: .medium, design: .rounded))
          .underline(true, color: EchoTheme.Color.linkBlue.opacity(0.72))
          .lineLimit(1)
          .truncationMode(.tail)
      }
    }
    .buttonStyle(.plain)
    .foregroundStyle(EchoTheme.Color.linkBlue)
    .accessibilityLabel(display)
    .accessibilityHint(EchoCopy.string("Opens in browser without loading inside Echo"))
    #if os(macOS)
      .onHover { hovering in
        guard !snippet else { return }
        hideTask?.cancel()
        if hovering {
          showingHover = true
        } else {
          // Web ~140ms hide delay so the cursor can enter the popover.
          hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 140_000_000)
            guard !Task.isCancelled else { return }
            showingHover = false
          }
        }
      }
      .popover(isPresented: $showingHover, arrowEdge: .bottom) {
        EchoMessageLinkHoverPreview(url: url, embed: matchedEmbed)
          .onHover { hovering in
            hideTask?.cancel()
            if hovering {
              showingHover = true
            } else {
              hideTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 140_000_000)
                guard !Task.isCancelled else { return }
                showingHover = false
              }
            }
          }
      }
    #endif
  }
}
