import LiveKit
import SwiftUI

/// Primary remote video (screen preferred) with a local picture-in-picture tile.
struct EchoCallVideoSurface: View {
  let remoteCamera: VideoTrack?
  let remoteScreen: VideoTrack?
  let localCamera: VideoTrack?
  let localScreen: VideoTrack?

  private var primaryRemote: VideoTrack? { remoteScreen ?? remoteCamera }
  private var localPreview: VideoTrack? { localScreen ?? localCamera }

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .bottomTrailing) {
        if let primaryRemote {
          SwiftUIVideoView(primaryRemote, layoutMode: .fit)
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        } else {
          Color.clear
        }

        if let localPreview {
          SwiftUIVideoView(localPreview, layoutMode: .fill, mirrorMode: localScreen == nil ? .mirror : .auto)
            .frame(width: min(132, proxy.size.width * 0.34), height: min(176, proxy.size.height * 0.34))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
              RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.22), lineWidth: 1)
            }
            .echoShadow(color: .black.opacity(0.4), radius: 16, y: 8)
            .padding(14)
        }
      }
    }
  }

  var hasAnyVideo: Bool {
    primaryRemote != nil || localPreview != nil
  }
}
