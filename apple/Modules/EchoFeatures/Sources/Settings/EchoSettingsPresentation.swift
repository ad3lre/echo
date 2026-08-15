import SwiftUI

struct EchoDetailSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content

  init(title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .tracking(1.8)
        .foregroundStyle(.white.opacity(0.42))
        .padding(.horizontal, 4)
      VStack(alignment: .leading, spacing: 14) {
        content()
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(.white.opacity(0.09), lineWidth: 1)
      }
    }
  }
}

struct EchoDetailHeader: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: icon)
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 52, height: 52)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
        Text(description)
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(.white.opacity(0.48))
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 12)
  }
}

/// Header used by settings detail tabs. The detail navigation bar is hidden so
/// Echo owns the visual title and the trailing back affordance as one stable row.
struct EchoSettingDetailHeader: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color
  let onBack: () -> Void

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: icon)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 46, height: 46)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.system(size: 25, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
        Text(description)
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(.white.opacity(0.48))
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Button(action: onBack) {
        Label("Back", systemImage: "chevron.left")
          .labelStyle(.titleAndIcon)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.9))
          .padding(.horizontal, 13)
          .frame(height: 40)
          .background(.white.opacity(0.075), in: Capsule())
          .overlay { Capsule().stroke(.white.opacity(0.10), lineWidth: 1) }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back to Settings")
    }
    .frame(minHeight: 58)
  }
}
