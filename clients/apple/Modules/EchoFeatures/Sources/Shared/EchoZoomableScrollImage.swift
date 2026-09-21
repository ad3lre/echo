import SwiftUI

#if os(iOS)
  import UIKit

  /// Pinch / double-tap zoom hosted in `UIScrollView` — feels like Photos.
  struct EchoZoomableScrollImage<Content: View>: UIViewRepresentable {
    var minZoom: CGFloat = 1
    var maxZoom: CGFloat = 4
    @ViewBuilder var content: () -> Content

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIScrollView {
      let scroll = UIScrollView()
      scroll.delegate = context.coordinator
      scroll.minimumZoomScale = minZoom
      scroll.maximumZoomScale = maxZoom
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
          scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
        } else {
          let point = gesture.location(in: host?.view)
          let target: CGFloat = 2.5
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
