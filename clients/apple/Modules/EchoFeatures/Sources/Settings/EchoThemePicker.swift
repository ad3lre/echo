import SwiftUI

/// Visual theme swatches matching web Settings → Appearance theme cards.
struct EchoThemePicker: View {
  @Binding var theme: String
  var syncTheme: Binding<Bool>? = nil

  private let columns = [
    GridItem(.flexible(), spacing: 10),
    GridItem(.flexible(), spacing: 10),
  ]

  var body: some View {
    LazyVGrid(columns: columns, spacing: 10) {
      ForEach(EchoAppearance.themeOptions, id: \.id) { option in
        Button {
          theme = option.id
          if let syncTheme, syncTheme.wrappedValue {
            syncTheme.wrappedValue = false
          }
        } label: {
          EchoThemeCard(
            id: option.id,
            label: EchoCopy.string(key: option.label),
            isSelected: theme.lowercased() == option.id
          )
        }
        .buttonStyle(.plain)
      }
    }
  }
}

private struct EchoThemeCard: View {
  let id: String
  let label: String
  let isSelected: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ZStack(alignment: .topLeading) {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(EchoAppearance.themePreviewFill(id: id))
          .overlay {
            if id == "sunny" {
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                  LinearGradient(
                    colors: [
                      EchoAppearance.sunnyPreviewSheen,
                      .clear,
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                  )
                )
            }
          }
          .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(
                isSelected
                  ? EchoTheme.Color.indigoSoft.opacity(0.85)
                  : EchoTheme.Color.ink(0.10),
                lineWidth: isSelected ? 2 : 1
              )
          }
          .frame(height: 72)

        VStack(alignment: .leading, spacing: 6) {
          Capsule()
            .fill(EchoAppearance.themePreviewBar(id: id))
            .frame(width: 54, height: 7)
          Capsule()
            .fill(EchoAppearance.themePreviewBar(id: id).opacity(0.72))
            .frame(width: 36, height: 7)
        }
        .padding(12)
      }

      HStack(spacing: 6) {
        Text(label)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.88))
        Spacer(minLength: 0)
        if isSelected {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.indigoSoft)
        }
      }
      .padding(.horizontal, 2)
    }
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityLabel(label)
  }
}
