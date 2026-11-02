import SwiftUI

/// Native vector counterpart of the dark-shell web Emotes asset.
/// The source SVG uses #3c3d4a chrome and #110b19 ink in a 36-point canvas.
struct EchoWebEmotesIcon: View {
  var body: some View {
    Canvas { context, size in
      let chrome = EchoTheme.Color.composerChrome
      let ink = EchoTheme.Color.composerInk
      let scale = min(size.width, size.height) / 36
      let origin = CGPoint(
        x: (size.width - 36 * scale) / 2,
        y: (size.height - 36 * scale) / 2)
      func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: origin.x + x * scale, y: origin.y + y * scale)
      }

      let face = Path(
        ellipseIn: CGRect(
          x: origin.x + 4 * scale, y: origin.y + 3.5 * scale,
          width: 28 * scale, height: 28 * scale))
      context.fill(face, with: .color(chrome))

      var leftEye = Path()
      leftEye.move(to: point(11.7, 14.5))
      leftEye.addCurve(
        to: point(16.2, 14.5),
        control1: point(12.8, 11.6),
        control2: point(15.1, 11.6))
      var rightEye = Path()
      rightEye.move(to: point(19.8, 14.5))
      rightEye.addCurve(
        to: point(24.3, 14.5),
        control1: point(20.9, 11.6),
        control2: point(23.2, 11.6))
      var smile = Path()
      smile.move(to: point(11.8, 20.3))
      smile.addCurve(
        to: point(24.2, 20.3),
        control1: point(15.2, 24.3),
        control2: point(20.8, 24.3))
      let stroke = StrokeStyle(lineWidth: 1.7 * scale, lineCap: .butt, lineJoin: .round)
      context.stroke(leftEye, with: .color(ink), style: stroke)
      context.stroke(rightEye, with: .color(ink), style: stroke)
      context.stroke(smile, with: .color(ink), style: stroke)
    }
    .frame(width: 24, height: 24)
  }
}

struct EchoAttachmentPanel: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  var selectedPhotoIDs: [String]
  let onChoosePhoto: (EchoComposerPhotoLibrary.Item) -> Void
  let onChooseFiles: () -> Void
  let onCreatePoll: () -> Void

  private let accent = EchoTheme.Color.indigo

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 3) {
        panelChip("photo.on.rectangle.angled", "Photos", active: true)
        panelChip("folder", "Files", action: onChooseFiles)
        panelChip("chart.bar", "Poll", action: onCreatePoll)
      }
      .padding(4)
      .background(EchoTheme.Color.ink(0.045), in: Capsule())
      .overlay {
        Capsule().stroke(EchoTheme.Color.ink(0.06), lineWidth: 1)
      }
      .padding(.bottom, 10)

      EchoComposerPhotoLibraryPane(
        photos: photos, selectedPhotoIDs: selectedPhotoIDs, onChoose: onChoosePhoto
      )
      .padding(6)
      .background(
        Color.black.opacity(0.22),
        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.05), lineWidth: 1)
      }
    }
    .padding(12)
    .background(
      EchoTheme.Color.elevatedDeep.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
    .echoShadow(color: .black.opacity(0.34), radius: 16, y: 7)
  }

  private func panelChip(
    _ icon: String, _ title: String, active: Bool = false, action: @escaping () -> Void = {}
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: icon)
          .font(.system(size: 12, weight: .semibold))
        Text(title)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .lineLimit(1)
          .minimumScaleFactor(0.85)
      }
      .foregroundStyle(active ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.58))
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
      .contentShape(Capsule())
      .echoPointerHoverFill(
        isSelected: active,
        selectedFill: accent,
        hoverFill: EchoTheme.Color.ink(0.08),
        cornerRadius: 20)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(active ? .isSelected : [])
    .accessibilityLabel(title)
  }
}
