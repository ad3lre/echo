import SwiftUI

/// Button style that yields to ScrollView pans.
///
/// Plain `Button` often fires on touch-up after a scroll that started on the
/// control. Routing through `onTapGesture` lets the timeline win on vertical
/// pans. Keep media outside reply-swipe hit targets so open-on-swipe cannot
/// return via a competing drag recognizer.
struct EchoScrollFriendlyButtonStyle: PrimitiveButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .contentShape(Rectangle())
      .onTapGesture(perform: configuration.trigger)
  }
}

extension PrimitiveButtonStyle where Self == EchoScrollFriendlyButtonStyle {
  static var echoScrollFriendly: EchoScrollFriendlyButtonStyle { EchoScrollFriendlyButtonStyle() }
}
