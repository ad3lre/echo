import EchoDomain
import SwiftUI

/// Fixed 16:9 collage box for images/GIFs in a message — web `MessageMediaCollage` parity.
struct EchoMessageMediaCollage: View {
  let images: [EchoMessageAttachment]
  let baseURL: URL
  var accessToken: String? = nil
  var isUploading = false
  var onOpen: ((Int) -> Void)? = nil

  private let gap: CGFloat = 3
  private let maxWidth: CGFloat = 300

  var body: some View {
    if let plan = EchoMediaCollagePlan.plan(itemCount: images.count) {
      GeometryReader { geo in
        let size = collageSize(in: geo.size)
        ZStack(alignment: .topLeading) {
          ForEach(Array(plan.cells.enumerated()), id: \.offset) { _, cell in
            Button {
              guard !isUploading else { return }
              onOpen?(cell.sourceIndex)
            } label: {
              cellView(cell)
            }
            .buttonStyle(.plain)
            .disabled(isUploading || onOpen == nil)
            .frame(
              width: cellWidth(cell, canvas: size, plan: plan),
              height: cellHeight(cell, canvas: size, plan: plan)
            )
            .offset(
              x: cellOriginX(cell, canvas: size, plan: plan),
              y: cellOriginY(cell, canvas: size, plan: plan)
            )
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(EchoCopy.string("Open media viewer"))
          }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .background(
          Color.black.opacity(0.28),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { uploadingChrome }
      }
      .aspectRatio(16 / 9, contentMode: .fit)
      .frame(maxWidth: maxWidth, alignment: .leading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.format("%lld images", images.count))
    }
  }

  private func cellView(_ cell: EchoMediaCollageCellPlan) -> some View {
    let attachment = images[cell.sourceIndex]
    return ZStack {
      EchoMediaImage(
        source: attachment.url,
        baseURL: baseURL,
        accessToken: accessToken,
        storageKey: attachment.storageKey,
        contentMode: cell.fit == .contain ? .fit : .fill
      ) {
        Rectangle().fill(.white.opacity(0.06))
      }
      .clipped()

      if attachment.spoiler {
        Rectangle()
          .fill(.black.opacity(0.42))
          .overlay {
            Label(EchoCopy.string("Spoiler"), systemImage: "eye.slash.fill")
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.9))
          }
      }

      if cell.overflowCount > 0 {
        Rectangle()
          .fill(.black.opacity(0.48))
          .overlay {
            let overflowLabel = "+" + String(cell.overflowCount)
            Text(overflowLabel)
              .font(.system(size: 28, weight: .bold, design: .rounded))
              .foregroundStyle(.white)
          }
          .accessibilityLabel(EchoCopy.format("%lld more images", cell.overflowCount))
      }
    }
  }

  @ViewBuilder
  private var uploadingChrome: some View {
    if isUploading {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.black.opacity(0.38))
        .overlay {
          VStack(spacing: 8) {
            ProgressView()
              .controlSize(.regular)
              .tint(.white)
            EchoCopy.text("Uploading")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.92))
          }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
  }

  private func collageSize(in proposed: CGSize) -> CGSize {
    let width = min(maxWidth, max(proposed.width, 1))
    let height = width * 9 / 16
    return CGSize(width: width, height: height)
  }

  private func cellWidth(_ cell: EchoMediaCollageCellPlan, canvas: CGSize, plan: EchoMediaCollagePlan)
    -> CGFloat
  {
    let gaps = CGFloat(plan.columnCount - 1) * gap
    let unit = (canvas.width - gaps) / CGFloat(plan.columnCount)
    return unit * CGFloat(cell.columnSpan) + gap * CGFloat(max(0, cell.columnSpan - 1))
  }

  private func cellHeight(_ cell: EchoMediaCollageCellPlan, canvas: CGSize, plan: EchoMediaCollagePlan)
    -> CGFloat
  {
    let gaps = CGFloat(plan.rowCount - 1) * gap
    let unit = (canvas.height - gaps) / CGFloat(plan.rowCount)
    return unit * CGFloat(cell.rowSpan) + gap * CGFloat(max(0, cell.rowSpan - 1))
  }

  private func cellOriginX(_ cell: EchoMediaCollageCellPlan, canvas: CGSize, plan: EchoMediaCollagePlan)
    -> CGFloat
  {
    let gaps = CGFloat(plan.columnCount - 1) * gap
    let unit = (canvas.width - gaps) / CGFloat(plan.columnCount)
    return CGFloat(cell.column) * (unit + gap)
  }

  private func cellOriginY(_ cell: EchoMediaCollageCellPlan, canvas: CGSize, plan: EchoMediaCollagePlan)
    -> CGFloat
  {
    let gaps = CGFloat(plan.rowCount - 1) * gap
    let unit = (canvas.height - gaps) / CGFloat(plan.rowCount)
    return CGFloat(cell.row) * (unit + gap)
  }
}
