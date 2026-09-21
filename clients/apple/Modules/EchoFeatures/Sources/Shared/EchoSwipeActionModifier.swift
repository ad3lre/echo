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
  let action: () -> Void

  @State private var offset: CGFloat = 0
  @GestureState private var isDragging = false

  private let reveal: CGFloat = 64
  private let trigger: CGFloat = 52

  func body(content: Content) -> some View {
    ZStack(alignment: edge == .trailing ? .trailing : .leading) {
      if enabled && abs(offset) > 8 {
        Image(systemName: systemImage)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
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
    DragGesture(minimumDistance: 18, coordinateSpace: .local)
      .updating($isDragging) { _, state, _ in
        state = true
      }
      .onChanged { value in
        let dx = value.translation.width
        let dy = value.translation.height
        guard abs(dx) > abs(dy) * 1.15 else {
          if offset != 0 { offset = 0 }
          return
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
        let shouldFire: Bool = {
          switch edge {
          case .leading: return dx >= trigger
          case .trailing: return dx <= -trigger
          }
        }()
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
          offset = 0
        }
        if shouldFire {
          action()
        }
      }
  }
}

extension View {
  func echoSwipeAction(
    edge: EchoSwipeActionModifier.Edge,
    systemImage: String,
    tint: Color,
    enabled: Bool = true,
    action: @escaping () -> Void
  ) -> some View {
    modifier(
      EchoSwipeActionModifier(
        edge: edge,
        systemImage: systemImage,
        tint: tint,
        enabled: enabled,
        action: action
      ))
  }
}
