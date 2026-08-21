import SwiftUI

struct EchoSettingMetric: View {
  let title: String
  let value: Int
  let icon: String
  let tint: Color

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 36, height: 36)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
      Text(title)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
      Spacer()
      Text("\(value)")
        .font(.system(size: 17, weight: .bold, design: .rounded))
        .foregroundStyle(tint)
        .monospacedDigit()
    }
  }
}

struct EchoSettingChoice: View {
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var value: String
  let options: [(String, String)]
  @State private var isPresented = false

  private var selectedLabel: String {
    options.first(where: { $0.0 == value })?.1 ?? value
  }

  var body: some View {
    Button {
      isPresented = true
    } label: {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 36, height: 36)
          .background(
            tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(title)
            .font(.system(size: 15, weight: .semibold, design: .rounded))
          Text(subtitle)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.secondary)
        }
        Spacer(minLength: 8)
        HStack(spacing: 5) {
          Text(selectedLabel)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
            .lineLimit(1)
          Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.secondary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .sheet(isPresented: $isPresented) {
      EchoChoiceSheet(
        title: title, subtitle: subtitle, icon: icon, tint: tint, value: $value, options: options)
    }
  }
}

struct EchoChoiceSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var searchText = ""
  let title: String
  let subtitle: String
  let icon: String
  let tint: Color
  @Binding var value: String
  let options: [(String, String)]

  private var filteredOptions: [(String, String)] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return options }
    return options.filter {
      $0.0.localizedCaseInsensitiveContains(query)
        || $0.1.localizedCaseInsensitiveContains(query)
    }
  }

  var body: some View {
    EchoSettingsSheetShell(
      title: title, description: subtitle, icon: icon, tint: tint, onCancel: { dismiss() },
      content: {
        VStack(spacing: 10) {
          if options.count > 100 {
            HStack(spacing: 9) {
              Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
              TextField(EchoCopy.format("Search %@", title.lowercased()), text: $searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(.white)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 46)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
          }
          ForEach(filteredOptions, id: \.0) { option in
            Button {
              value = option.0
              dismiss()
            } label: {
              HStack(spacing: 12) {
                Circle()
                  .fill(option.0 == value ? tint : .white.opacity(0.12))
                  .frame(width: 12, height: 12)
                  .overlay {
                    if option.0 == value {
                      Circle().stroke(.white.opacity(0.9), lineWidth: 2).padding(3)
                    }
                  }
                Text(option.1)
                  .font(.system(size: 16, weight: .semibold, design: .rounded))
                  .foregroundStyle(.white.opacity(0.92))
                Spacer()
                if option.0 == value {
                  Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(tint)
                }
              }
              .padding(.horizontal, 15)
              .frame(minHeight: 54)
              .background(
                option.0 == value ? tint.opacity(0.13) : .white.opacity(0.06),
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                  .stroke(
                    option.0 == value ? tint.opacity(0.42) : .white.opacity(0.10), lineWidth: 1)
              }
            }
            .buttonStyle(.plain)
          }
        }
      })
  }
}
