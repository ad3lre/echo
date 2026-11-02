import SwiftUI

/// Centered glass overlay used by invite / create / notification guild modals.
struct EchoGuildDesktopModal<Content: View>: View {
  var maxWidth: CGFloat = 560
  var onClose: () -> Void
  @ViewBuilder var content: () -> Content

  var body: some View {
    ZStack {
      EchoTheme.Color.ink(0.52)
        .background(.ultraThinMaterial.opacity(0.45))
        .ignoresSafeArea()
        .onTapGesture(perform: onClose)
      content()
        .padding(24)
        .frame(maxWidth: maxWidth)
        .background {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.ultraThinMaterial)
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(EchoTheme.Color.elevated.opacity(0.82))
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .echoShadow(color: .black.opacity(0.42), radius: 36, y: 16)
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
    }
  }
}

struct EchoGuildModalCloseButton: View {
  var action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(EchoTheme.Color.ink(hovered ? 0.88 : 0.48))
        .frame(width: 32, height: 32)
        .background(
          EchoTheme.Color.ink(hovered ? 0.10 : 0),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .accessibilityLabel(EchoCopy.string("Close"))
  }
}

struct EchoDesktopLabeledField<Content: View>: View {
  let title: String
  var minHeight: CGFloat = 40
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      content()
        .textFieldStyle(.plain)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: minHeight, alignment: .leading)
        .background(
          EchoTheme.Color.elevatedMid,
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }
  }
}

struct EchoDesktopPrimaryButton: View {
  let title: String
  var enabled = true
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.onAccent)
        .padding(.horizontal, 16)
        .frame(height: 36)
        .background(
          EchoTheme.Color.indigoDeep.opacity(enabled ? 1 : 0.45),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
  }
}

struct EchoDesktopGhostButton: View {
  let title: String
  var action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(hovered ? 0.88 : 0.52))
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(
          EchoTheme.Color.ink(hovered ? 0.08 : 0),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
  }
}
