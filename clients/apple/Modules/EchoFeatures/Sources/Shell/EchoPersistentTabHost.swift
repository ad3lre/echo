import SwiftUI

#if os(iOS)
  import UIKit

  /// Hosts a tab’s SwiftUI tree in a `UIHostingController` and toggles visibility
  /// with UIKit `isHidden` — inactive tabs are not laid out or composited, which
  /// is how mobile web stays instant (`display` / keep-alive) while we stay native.
  struct EchoPersistentTabHost<Content: View>: UIViewControllerRepresentable {
    var isActive: Bool
    /// Bumped on Style → Theme flips so keep-alive tabs drop stale dark/light bitmaps.
    var appearanceEpoch: Int = 0
    var content: Content

    func makeCoordinator() -> Coordinator {
      Coordinator()
    }

    func makeUIViewController(context: Context) -> EchoPersistentTabController<Content> {
      let controller = EchoPersistentTabController(rootView: content)
      controller.view.backgroundColor = .clear
      controller.view.isOpaque = false
      context.coordinator.appearanceEpoch = appearanceEpoch
      applyVisibility(controller)
      return controller
    }

    func updateUIViewController(
      _ controller: EchoPersistentTabController<Content>, context: Context
    ) {
      let appearanceChanged = context.coordinator.appearanceEpoch != appearanceEpoch
      if appearanceChanged {
        context.coordinator.appearanceEpoch = appearanceEpoch
        // Frozen inactive tabs otherwise keep the previous theme’s ink (white
        // names on light after Dark → Light until you leave and re-enter).
        controller.view.layer.shouldRasterize = false
      }

      // Push SwiftUI updates while visible, or whenever appearance changed so
      // the next show isn’t a stale dark/light snapshot.
      if isActive || appearanceChanged {
        controller.rootView = content
      }
      applyVisibility(controller)
    }

    private func applyVisibility(_ controller: EchoPersistentTabController<Content>) {
      controller.view.isUserInteractionEnabled = isActive

      if isActive {
        // Live again before unhiding so the first visible frame isn’t a stale bitmap.
        if controller.view.layer.shouldRasterize {
          controller.view.layer.shouldRasterize = false
        }
        if controller.view.isHidden {
          controller.view.isHidden = false
        }
        if controller.view.alpha != 1 {
          controller.view.alpha = 1
        }
      } else {
        // Snapshot while still visible, then hide — switch cost is show/hide only.
        if !controller.view.layer.shouldRasterize {
          controller.view.layer.rasterizationScale = UIScreen.main.scale
          controller.view.layer.shouldRasterize = true
        }
        if controller.view.alpha != 0 {
          controller.view.alpha = 0
        }
        if !controller.view.isHidden {
          controller.view.isHidden = true
        }
      }
    }

    final class Coordinator {
      var appearanceEpoch: Int = 0
    }
  }

  final class EchoPersistentTabController<Content: View>: UIHostingController<Content> {
    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .clear
      view.isOpaque = false
    }

    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      // UIHostingController can reassert an opaque black fill after layout.
      if view.backgroundColor != .clear {
        view.backgroundColor = .clear
      }
      view.isOpaque = false
    }
  }
#else
  /// macOS: plain opacity swap (no UIKit host).
  struct EchoPersistentTabHost<Content: View>: View {
    var isActive: Bool
    var appearanceEpoch: Int = 0
    var content: Content

    var body: some View {
      let _ = appearanceEpoch
      content
        .opacity(isActive ? 1 : 0)
        .allowsHitTesting(isActive)
        .accessibilityHidden(!isActive)
        .id(appearanceEpoch)
    }
  }
#endif
