import SwiftUI

#if os(iOS)
  import UIKit

  /// Pinch / double-tap zoom hosted in `UIScrollView` — feels like Photos.
  struct EchoZoomableScrollImage<Content: View>: UIViewRepresentable {
    var minZoom: CGFloat = EchoMediaViewerZoom.min
    var maxZoom: CGFloat = EchoMediaViewerZoom.max
    @ViewBuilder var content: () -> Content

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIScrollView {
      let scroll = UIScrollView()
      scroll.delegate = context.coordinator
      scroll.minimumZoomScale = minZoom
      scroll.maximumZoomScale = maxZoom
      scroll.zoomScale = EchoMediaViewerZoom.initial
      scroll.bouncesZoom = true
      scroll.showsHorizontalScrollIndicator = false
      scroll.showsVerticalScrollIndicator = false
      scroll.backgroundColor = .clear
      scroll.contentInsetAdjustmentBehavior = .never

      let host = UIHostingController(rootView: content())
      host.view.backgroundColor = .clear
      host.view.translatesAutoresizingMaskIntoConstraints = false
      scroll.addSubview(host.view)
      context.coordinator.host = host
      context.coordinator.scrollView = scroll

      NSLayoutConstraint.activate([
        host.view.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
        host.view.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
        host.view.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
        host.view.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
        host.view.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        host.view.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
      ])

      let doubleTap = UITapGestureRecognizer(
        target: context.coordinator, action: #selector(Coordinator.handleDoubleTap(_:)))
      doubleTap.numberOfTapsRequired = 2
      scroll.addGestureRecognizer(doubleTap)
      return scroll
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
      context.coordinator.host?.rootView = content()
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
      var host: UIHostingController<Content>?
      weak var scrollView: UIScrollView?

      func viewForZooming(in scrollView: UIScrollView) -> UIView? { host?.view }

      @objc func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        guard let scrollView else { return }
        if scrollView.zoomScale > scrollView.minimumZoomScale + 0.01 {
          scrollView.setZoomScale(EchoMediaViewerZoom.initial, animated: true)
        } else {
          let point = gesture.location(in: host?.view)
          let target: CGFloat = 2
          let size = scrollView.bounds.size
          let width = size.width / target
          let height = size.height / target
          let rect = CGRect(
            x: point.x - width / 2, y: point.y - height / 2, width: width, height: height)
          scrollView.zoom(to: rect, animated: true)
        }
      }
    }
  }
#endif

#if os(macOS)
  import AppKit

  /// Web `ImageViewerModal` zoom/pan: pinch, wheel, drag, double-click.
  /// Pan is clamped to the overflow of the scaled image (not free-float).
  struct EchoMacZoomableImage<Content: View>: View {
    @Binding var zoom: CGFloat
    @ViewBuilder var content: () -> Content
    @State private var pan = CGSize.zero
    @GestureState private var pinch: CGFloat = 1
    @State private var dragOrigin = CGSize.zero
    @State private var viewport = CGSize.zero

    private var shownZoom: CGFloat { EchoMediaViewerZoom.clamp(zoom * pinch) }
    private var canPan: Bool { shownZoom > EchoMediaViewerZoom.panThreshold }

    var body: some View {
      GeometryReader { geo in
        content()
          .frame(width: geo.size.width, height: geo.size.height)
          .scaleEffect(shownZoom, anchor: .center)
          .offset(pan)
          .gesture(drag(in: geo.size))
          .simultaneousGesture(magnify(in: geo.size))
          .onTapGesture(count: 2) { toggleZoom(in: geo.size) }
          .background {
            EchoMacWheelCatcher { deltaX, deltaY, command in
              handleWheel(deltaX: deltaX, deltaY: deltaY, command: command, in: geo.size)
            }
          }
          .onAppear {
            viewport = geo.size
            applyClamp(in: geo.size)
          }
          .onChange(of: geo.size) { _, size in
            viewport = size
            applyClamp(in: size)
          }
      }
      .onChange(of: zoom) { _, next in
        if next <= EchoMediaViewerZoom.panThreshold {
          pan = .zero
          dragOrigin = .zero
        } else {
          applyClamp(in: viewport)
        }
      }
    }

    private func magnify(in size: CGSize) -> some Gesture {
      MagnifyGesture()
        .updating($pinch) { value, state, _ in
          state = value.magnification
        }
        .onEnded { value in
          zoom = EchoMediaViewerZoom.clamp(zoom * value.magnification)
          applyClamp(in: size)
          dragOrigin = pan
        }
    }

    private func drag(in size: CGSize) -> some Gesture {
      DragGesture()
        .onChanged { value in
          guard canPan else { return }
          pan = EchoMediaViewerZoom.clampedPan(
            CGSize(
              width: dragOrigin.width + value.translation.width,
              height: dragOrigin.height + value.translation.height),
            viewport: size,
            zoom: shownZoom)
        }
        .onEnded { _ in
          applyClamp(in: size)
          dragOrigin = pan
        }
    }

    /// Returns whether the event was handled (consumed).
    private func handleWheel(
      deltaX: CGFloat, deltaY: CGFloat, command: Bool, in size: CGSize
    ) -> Bool {
      if command {
        zoom = EchoMediaViewerZoom.clamp(zoom * CGFloat(exp(-deltaY * 0.002)))
        applyClamp(in: size)
        dragOrigin = pan
        return true
      }
      guard canPan else { return false }
      let f = EchoMediaViewerZoom.trackpadPanFactor
      pan = EchoMediaViewerZoom.clampedPan(
        CGSize(width: pan.width - deltaX * f, height: pan.height - deltaY * f),
        viewport: size,
        zoom: shownZoom)
      dragOrigin = pan
      return true
    }

    private func toggleZoom(in size: CGSize) {
      if zoom <= EchoMediaViewerZoom.panThreshold {
        zoom = 2
      } else {
        zoom = EchoMediaViewerZoom.initial
        pan = .zero
        dragOrigin = .zero
      }
      applyClamp(in: size)
    }

    private func applyClamp(in size: CGSize) {
      guard size.width > 0, size.height > 0 else { return }
      pan = EchoMediaViewerZoom.clampedPan(pan, viewport: size, zoom: shownZoom)
      dragOrigin = pan
    }
  }

  private struct EchoMacWheelCatcher: NSViewRepresentable {
    var onWheel: (_ deltaX: CGFloat, _ deltaY: CGFloat, _ command: Bool) -> Bool

    func makeNSView(context: Context) -> EchoMacWheelView {
      let view = EchoMacWheelView()
      view.onWheel = onWheel
      return view
    }

    func updateNSView(_ view: EchoMacWheelView, context: Context) {
      view.onWheel = onWheel
    }
  }

  final class EchoMacWheelView: NSView {
    var onWheel: ((_ deltaX: CGFloat, _ deltaY: CGFloat, _ command: Bool) -> Bool)?
    private var monitor: Any?

    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewWillMove(toWindow newWindow: NSWindow?) {
      super.viewWillMove(toWindow: newWindow)
      if newWindow == nil { clearMonitor() }
    }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      clearMonitor()
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .magnify]) {
        [weak self] event in
        guard let self, self.window === event.window else { return event }
        if event.type == .magnify {
          let handled = self.onWheel?(0, -event.magnification * 500, true) ?? false
          return handled ? nil : event
        }
        let handled =
          self.onWheel?(
            event.scrollingDeltaX, event.scrollingDeltaY,
            event.modifierFlags.contains(.command)) ?? false
        return handled ? nil : event
      }
    }

    private func clearMonitor() {
      if let monitor {
        NSEvent.removeMonitor(monitor)
        self.monitor = nil
      }
    }
  }
#endif
