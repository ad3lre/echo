import SwiftUI

/// Horizontal swipe that reveals a trailing/leading action icon and fires on release.
struct EchoSwipeActionModifier: ViewModifier {
  enum Edge {
    case leading  // swipe right
    case trailing  // swipe left
  }

  let edge: Edge
  let systemImage: String
  let tint: Color
  let enabled: Bool
  /// When set for `.leading`, the drag must begin within this many points of
  /// the left edge so mid-screen horizontal pans cannot fire the action.
  var leadingEdgeStartWidth: CGFloat? = nil
  let action: () -> Void

  @State private var offset: CGFloat = 0
  /// Set once the drag proves horizontal so vertical scrolls cannot fire the action.
  @State private var didLockHorizontal = false
  @State private var startAllowed = false
  @GestureState private var isDragging = false

  private let reveal: CGFloat = 64
  private let trigger: CGFloat = 52
  /// dx must clearly beat dy before we steal the gesture from ScrollView.
  private let horizontalBias: CGFloat = 1.35

  func body(content: Content) -> some View {
    ZStack(alignment: edge == .trailing ? .trailing : .leading) {
      if enabled && abs(offset) > 8 {
        Image(systemName: systemImage)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.onAccent)
          .frame(width: 36, height: 36)
          .background(tint, in: Circle())
          .padding(.horizontal, 18)
          .opacity(min(1, abs(offset) / reveal))
          .scaleEffect(min(1.05, 0.82 + abs(offset) / 180))
          .accessibilityHidden(true)
      }

      content
        .offset(x: enabled ? offset : 0)
        .simultaneousGesture(enabled ? dragGesture : nil)
    }
    .clipped()
  }

  private var dragGesture: some Gesture {
    DragGesture(minimumDistance: 24, coordinateSpace: .local)
      .updating($isDragging) { _, state, _ in
        state = true
      }
      .onChanged { value in
        if !didLockHorizontal && !startAllowed {
          startAllowed = isStartAllowed(value)
          guard startAllowed else { return }
        }
        guard startAllowed else { return }

        let dx = value.translation.width
        let dy = value.translation.height
        if !didLockHorizontal {
          // Stay out of vertical scrolls (and diagonal rubber-banding) until
          // the finger has clearly committed sideways.
          guard abs(dx) > abs(dy) * horizontalBias, abs(dx) >= 18 else {
            if offset != 0 { offset = 0 }
            return
          }
          didLockHorizontal = true
        }
        switch edge {
        case .leading:
          offset = max(0, min(reveal, dx))
        case .trailing:
          offset = min(0, max(-reveal, dx))
        }
      }
      .onEnded { value in
        let dx = value.translation.width
        let dy = value.translation.height
        let isHorizontal =
          startAllowed && didLockHorizontal && abs(dx) > abs(dy) * horizontalBias
        let shouldFire: Bool = {
          guard isHorizontal else { return false }
          switch edge {
          case .leading: return dx >= trigger
          case .trailing: return dx <= -trigger
          }
        }()
        didLockHorizontal = false
        startAllowed = false
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
          offset = 0
        }
        if shouldFire {
          action()
        }
      }
  }

  private func isStartAllowed(_ value: DragGesture.Value) -> Bool {
    guard edge == .leading, let leadingEdgeStartWidth else { return true }
    return value.startLocation.x <= leadingEdgeStartWidth
  }
}

extension View {
  func echoSwipeAction(
    edge: EchoSwipeActionModifier.Edge,
    systemImage: String,
    tint: Color,
    enabled: Bool = true,
    leadingEdgeStartWidth: CGFloat? = nil,
    action: @escaping () -> Void
  ) -> some View {
    modifier(
      EchoSwipeActionModifier(
        edge: edge,
        systemImage: systemImage,
        tint: tint,
        enabled: enabled,
        leadingEdgeStartWidth: leadingEdgeStartWidth,
        action: action
      ))
  }
}
