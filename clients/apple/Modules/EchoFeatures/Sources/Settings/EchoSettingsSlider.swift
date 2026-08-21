import SwiftUI

struct EchoSettingSlider: View {
  let title: String
  let icon: String
  let tint: Color
  @Binding var value: Double
  let range: ClosedRange<Double>
  var showsIcon = true
  var valueScale = 1.0

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        if showsIcon {
          Image(systemName: icon)
            .font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
        }
        Text(title)
          .font(.system(size: 14, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.58))
        Spacer()
        Text("\(Int(value * valueScale))%")
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.78))
          .monospacedDigit()
      }
      GeometryReader { geometry in
        let progress = normalizedValue
        ZStack(alignment: .leading) {
          Capsule(style: .continuous).fill(.white.opacity(0.10))
          Capsule(style: .continuous)
            .fill(
              LinearGradient(
                colors: [tint.opacity(0.55), tint.opacity(0.92)], startPoint: .leading,
                endPoint: .trailing)
            )
            .frame(width: max(14, geometry.size.width * progress))
          Circle()
            .fill(.white).frame(width: 22, height: 22)
            .overlay { Circle().stroke(.white.opacity(0.22), lineWidth: 1) }
            .shadow(color: .black.opacity(0.28), radius: 6, y: 1)
            .offset(x: max(0, min(geometry.size.width - 22, geometry.size.width * progress - 11)))
        }
        .frame(height: 22)
        .contentShape(Rectangle().inset(by: -10))
        .gesture(
          DragGesture(minimumDistance: 0).onChanged { gesture in
            updateValue(at: gesture.location.x, width: geometry.size.width)
          })
      }
      .frame(height: 28)
    }
    .accessibilityElement(children: .combine)
    .accessibilityValue("\(Int(value * valueScale)) percent")
    .accessibilityAdjustableAction { direction in
      let increment = (range.upperBound - range.lowerBound) / 20
      switch direction {
      case .increment: value = min(range.upperBound, value + increment)
      case .decrement: value = max(range.lowerBound, value - increment)
      @unknown default: break
      }
    }
  }

  private var normalizedValue: Double {
    guard range.upperBound > range.lowerBound else { return 0 }
    return min(1, max(0, (value - range.lowerBound) / (range.upperBound - range.lowerBound)))
  }

  private func updateValue(at location: CGFloat, width: CGFloat) {
    guard width > 0 else { return }
    let normalized = min(1, max(0, location / width))
    value = range.lowerBound + normalized * (range.upperBound - range.lowerBound)
  }
}
