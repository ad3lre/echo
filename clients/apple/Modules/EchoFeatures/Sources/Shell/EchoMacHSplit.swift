import SwiftUI

#if os(macOS)
  import AppKit
  /// Draggable primary | secondary split for Mac desktop panes (DM list | chat).
  struct EchoMacHSplit<Primary: View, Secondary: View>: View {
    var minPrimary: CGFloat = 220
    var maxPrimary: CGFloat = 520
    var storageKey: String
    /// Web `startDmPanelResize`: drag left while already at `minPrimary` collapses the pane.
    var onCollapse: (() -> Void)? = nil
    @ViewBuilder var primary: () -> Primary
    @ViewBuilder var secondary: () -> Secondary

    @AppStorage private var storedWidth: Double
    @State private var dragOrigin: CGFloat?
    @State private var lastDragDelta: CGFloat = 0

    init(
      minPrimary: CGFloat = 220,
      maxPrimary: CGFloat = 520,
      defaultPrimary: CGFloat = 320,
      storageKey: String,
      onCollapse: (() -> Void)? = nil,
      @ViewBuilder primary: @escaping () -> Primary,
      @ViewBuilder secondary: @escaping () -> Secondary
    ) {
      self.minPrimary = minPrimary
      self.maxPrimary = maxPrimary
      self.storageKey = storageKey
      self.onCollapse = onCollapse
      self.primary = primary
      self.secondary = secondary
      _storedWidth = AppStorage(wrappedValue: Double(defaultPrimary), storageKey)
    }

    private var primaryWidth: CGFloat {
      min(maxPrimary, max(minPrimary, CGFloat(storedWidth)))
    }

    var body: some View {
      GeometryReader { proxy in
        let cappedMax = min(maxPrimary, max(minPrimary, proxy.size.width - 360))
        let width = min(cappedMax, max(minPrimary, CGFloat(storedWidth)))
        HStack(spacing: 0) {
          primary()
            .frame(width: width)
            .frame(maxHeight: .infinity)
            .clipped()

          splitHandle
            .gesture(
              DragGesture(minimumDistance: 1)
                .onChanged { value in
                  if dragOrigin == nil { dragOrigin = width }
                  guard let origin = dragOrigin else { return }
                  lastDragDelta = value.translation.width
                  let next = origin + value.translation.width
                  storedWidth = Double(
                    min(cappedMax, max(minPrimary, next)))
                }
                .onEnded { _ in
                  // Match web: leftward drag while pinned at min collapses the panel.
                  if let onCollapse,
                    lastDragDelta < -12,
                    CGFloat(storedWidth) <= minPrimary + 0.5
                  {
                    onCollapse()
                  }
                  dragOrigin = nil
                  lastDragDelta = 0
                }
            )

          secondary()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
      }
    }

    private var splitHandle: some View {
      EchoMacSplitHandle(
        accessibilityLabel: EchoCopy.string("Resize sidebar"))
    }
  }

  /// Invisible col-resize hit target (web `w-2 cursor-col-resize` — no painted divider).
  struct EchoMacSplitHandle: View {
    var accessibilityLabel: String = EchoCopy.string("Resize panel")

    var body: some View {
      Rectangle()
        .fill(Color.clear)
        .frame(width: 6)
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        .onHover { hovering in
          if hovering {
            NSCursor.resizeLeftRight.push()
          } else {
            NSCursor.pop()
          }
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }
  }

  /// Trailing pane with a fleeter leading-edge resize (guild members — web `startMemberResize`).
  /// Dragging left widens the pane; drag past min collapses when `onCollapse` is set.
  struct EchoMacTrailingWidth<Content: View>: View {
    var minWidth: CGFloat = 180
    var maxWidth: CGFloat = 480
    var storageKey: String
    var onCollapse: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content

    @AppStorage private var storedWidth: Double
    @State private var dragOrigin: CGFloat?
    @State private var lastDragDelta: CGFloat = 0

    init(
      minWidth: CGFloat = 180,
      maxWidth: CGFloat = 480,
      defaultWidth: CGFloat = 280,
      storageKey: String,
      onCollapse: (() -> Void)? = nil,
      @ViewBuilder content: @escaping () -> Content
    ) {
      self.minWidth = minWidth
      self.maxWidth = maxWidth
      self.storageKey = storageKey
      self.onCollapse = onCollapse
      self.content = content
      _storedWidth = AppStorage(wrappedValue: Double(defaultWidth), storageKey)
    }

    var body: some View {
      let width = min(maxWidth, max(minWidth, CGFloat(storedWidth)))
      HStack(spacing: 0) {
        EchoMacSplitHandle(
          accessibilityLabel: EchoCopy.string("Resize members panel")
        )
        .gesture(
          DragGesture(minimumDistance: 1)
            .onChanged { value in
              if dragOrigin == nil { dragOrigin = width }
              guard let origin = dragOrigin else { return }
              // Leading edge of a trailing pane: drag left → wider.
              lastDragDelta = value.translation.width
              let next = origin - value.translation.width
              storedWidth = Double(min(maxWidth, max(minWidth, next)))
            }
            .onEnded { _ in
              if let onCollapse,
                lastDragDelta > 12,
                CGFloat(storedWidth) <= minWidth + 0.5
              {
                onCollapse()
              }
              dragOrigin = nil
              lastDragDelta = 0
            }
        )

        content()
          .frame(width: width)
          .frame(maxHeight: .infinity)
          .clipped()
      }
    }
  }
#endif
