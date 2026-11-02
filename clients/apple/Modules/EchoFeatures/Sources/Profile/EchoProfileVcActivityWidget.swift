import SwiftUI

/// Web `ProfileVcActivityWidget` — ongoing guild activity under the in-voice card.
struct EchoProfileVcActivityWidget: View {
  let activity: EchoProfileOngoingVcActivity
  var joinable = false
  var onJoin: (() -> Void)? = nil

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.string("In activity"))
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        Text(activity.label)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
        Text(EchoCopy.string("Join their voice activity"))
          .font(.system(size: 12, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .lineLimit(2)
      }
      Spacer(minLength: 0)
      if joinable, let onJoin {
        Button(EchoCopy.string("Join"), action: onJoin)
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .accessibilityLabel(
            EchoCopy.format("Join %@", activity.label))
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(EchoTheme.Color.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .accessibilityElement(children: .combine)
    .accessibilityLabel(EchoCopy.format("In activity: %@", activity.label))
  }
}
