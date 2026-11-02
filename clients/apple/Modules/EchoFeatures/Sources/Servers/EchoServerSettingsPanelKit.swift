import EchoDomain
import EchoNetworking
import Foundation
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Shared chrome for server-settings panels

extension View {
  /// Rounded tinted card used by every server-settings panel row.
  func echoSettingsCard(padding: CGFloat = 14) -> some View {
    self
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        EchoTheme.Color.ink(0.035),
        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

/// Server `message` when available, otherwise the localized fallback.
func echoSettingsErrorMessage(_ error: Error, fallback: String) -> String {
  if let home = error as? EchoHomeClientError, case .server(_, _, let message) = home,
    let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  {
    return message
  }
  return fallback
}

struct EchoSettingsSectionHeading: View {
  let title: String
  var subtitle: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      if let subtitle {
        Text(subtitle)
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

struct EchoSettingsToggleRow: View {
  let title: String
  var subtitle: String? = nil
  @Binding var isOn: Bool
  var disabled = false

  var body: some View {
    Toggle(isOn: $isOn) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        if let subtitle {
          Text(subtitle)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    .toggleStyle(.switch)
    .disabled(disabled)
    .echoSettingsCard()
  }
}

/// Labeled custom dropdown — never a system `Picker` / native menu.
struct EchoSettingsPickerField<Value: Hashable>: View {
  let title: String
  @Binding var selection: Value
  let options: [(Value, String)]
  var disabled = false
  var subtitle: String? = nil
  /// `nil` enables search automatically when there are more than 12 options.
  var searchable: Bool? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      if let subtitle {
        Text(subtitle)
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .fixedSize(horizontal: false, vertical: true)
      }
      EchoSettingsDropdown(
        selection: $selection,
        options: options,
        disabled: disabled,
        searchable: searchable ?? (options.count > 12)
      )
    }
  }
}

/// Custom Echo dropdown (popover list). Use this instead of `Picker` / `.menu`.
struct EchoSettingsDropdown<Value: Hashable>: View {
  @Binding var selection: Value
  let options: [(Value, String)]
  var disabled = false
  var searchable = false
  var placeholder = "—"

  @State private var open = false
  @State private var query = ""
  @State private var hovered = false

  private var selectedLabel: String {
    options.first(where: { $0.0 == selection })?.1 ?? placeholder
  }

  private var filtered: [(Value, String)] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !q.isEmpty else { return options }
    return options.filter { $0.1.localizedCaseInsensitiveContains(q) }
  }

  var body: some View {
    Button {
      guard !disabled else { return }
      open.toggle()
    } label: {
      HStack(spacing: 8) {
        Text(selectedLabel)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(
            disabled ? EchoTheme.Color.ink(0.35) : EchoTheme.Color.fg
          )
          .lineLimit(1)
        Spacer(minLength: 8)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(disabled ? 0.25 : 0.42))
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
      .background(
        EchoTheme.Color.elevatedMid,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(
            open
              ? EchoTheme.Color.signInBlue.opacity(0.5)
              : EchoTheme.Color.ink(hovered ? 0.14 : 0.08),
            lineWidth: 1
          )
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.65 : 1)
    .onHover { hovered = $0 }
    .popover(isPresented: $open, arrowEdge: .bottom) {
      dropdownMenu
        .onDisappear { query = "" }
    }
  }

  private var dropdownMenu: some View {
    VStack(alignment: .leading, spacing: 0) {
      if searchable {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          TextField(EchoCopy.string("Search"), text: $query)
            .textFieldStyle(.plain)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(EchoTheme.Color.fg)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(EchoTheme.Color.ink(0.04))
        Divider().opacity(0.35)
      }

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 2) {
          if filtered.isEmpty {
            Text(EchoCopy.string("No matches"))
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
              .padding(.horizontal, 12)
              .padding(.vertical, 14)
          } else {
            ForEach(filtered, id: \.0) { option in
              dropdownRow(value: option.0, label: option.1)
            }
          }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 6)
      }
      .frame(maxHeight: searchable ? 280 : min(CGFloat(options.count) * 36 + 16, 260))
    }
    .frame(minWidth: 240)
    .background(EchoTheme.Color.elevated)
  }

  private func dropdownRow(value: Value, label: String) -> some View {
    let selected = value == selection
    return Button {
      selection = value
      open = false
    } label: {
      HStack(spacing: 10) {
        Text(label)
          .font(.system(size: 13.5, weight: selected ? .semibold : .medium))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
        Spacer(minLength: 8)
        if selected {
          Image(systemName: "checkmark")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(EchoTheme.Color.signInBlue)
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.14) : Color.clear,
        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// Web-style pill tab strip (location Voice / Text / Custom, etc.).
struct EchoSettingsSegmentedControl<Value: Hashable>: View {
  @Binding var selection: Value
  let options: [(Value, String)]
  var disabled = false

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options, id: \.0) { value, title in
        let selected = selection == value
        Button {
          guard !disabled else { return }
          selection = value
        } label: {
          Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(
              selected ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.55)
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
              selected ? EchoTheme.Color.signInBlue : Color.clear,
              in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
      }
    }
    .padding(3)
    .background(
      EchoTheme.Color.ink(0.05),
      in: RoundedRectangle(cornerRadius: 11, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 11, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
  }
}

/// Custom date+time field: labeled trigger + popover calendar (not compact DatePicker).
struct EchoSettingsDateTimeField: View {
  let title: String
  @Binding var date: Date
  var minimumDate: Date? = nil
  var invalid = false
  var disabled = false

  @State private var open = false
  @State private var hovered = false

  private var display: String {
    date.formatted(date: .abbreviated, time: .shortened)
  }

  private var hourBinding: Binding<Int> {
    Binding(
      get: { Calendar.current.component(.hour, from: date) },
      set: { applyTime(hour: $0, minute: Calendar.current.component(.minute, from: date)) }
    )
  }

  private var minuteBinding: Binding<Int> {
    Binding(
      get: { Calendar.current.component(.minute, from: date) },
      set: { applyTime(hour: Calendar.current.component(.hour, from: date), minute: $0) }
    )
  }

  private var hourOptions: [(Int, String)] {
    (0..<24).map { ($0, String(format: "%02d", $0)) }
  }

  private var minuteOptions: [(Int, String)] {
    var opts = stride(from: 0, through: 55, by: 5).map {
      ($0, String(format: "%02d", $0))
    }
    let minute = Calendar.current.component(.minute, from: date)
    if minute % 5 != 0, !opts.contains(where: { $0.0 == minute }) {
      opts.append((minute, String(format: "%02d", minute)))
      opts.sort { $0.0 < $1.0 }
    }
    return opts
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title.uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      Button {
        guard !disabled else { return }
        open.toggle()
      } label: {
        HStack(spacing: 8) {
          Text(display)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(disabled ? EchoTheme.Color.ink(0.35) : EchoTheme.Color.fg)
            .lineLimit(1)
          Spacer(minLength: 8)
          Image(systemName: "calendar")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(disabled ? 0.25 : 0.45))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
        .background(
          EchoTheme.Color.elevatedMid,
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(
              invalid
                ? EchoTheme.Color.mentionPing.opacity(0.7)
                : (open
                  ? EchoTheme.Color.signInBlue.opacity(0.5)
                  : EchoTheme.Color.ink(hovered ? 0.14 : 0.08)),
              lineWidth: 1
            )
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(disabled)
      .opacity(disabled ? 0.65 : 1)
      .onHover { hovered = $0 }
      .popover(isPresented: $open, arrowEdge: .bottom) {
        VStack(alignment: .leading, spacing: 12) {
          DatePicker(
            "",
            selection: $date,
            in: (minimumDate ?? Date.distantPast)...,
            displayedComponents: [.date]
          )
          .datePickerStyle(.graphical)
          .labelsHidden()
          .frame(minWidth: 280)

          HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
              Text(EchoCopy.string("Hour").uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(EchoTheme.Color.ink(0.42))
              EchoSettingsDropdown(
                selection: hourBinding, options: hourOptions, searchable: false)
            }
            .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 6) {
              Text(EchoCopy.string("Minute").uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(EchoTheme.Color.ink(0.42))
              EchoSettingsDropdown(
                selection: minuteBinding, options: minuteOptions, searchable: false)
            }
            .frame(maxWidth: .infinity)
          }

          HStack {
            Spacer()
            EchoDesktopPrimaryButton(title: EchoCopy.string("Done")) { open = false }
          }
        }
        .padding(14)
        .frame(minWidth: 300)
        .background(EchoTheme.Color.elevated)
      }
    }
  }

  private func applyTime(hour: Int, minute: Int) {
    var comps = Calendar.current.dateComponents(
      [.year, .month, .day, .hour, .minute], from: date)
    comps.hour = hour
    comps.minute = minute
    comps.second = 0
    guard let next = Calendar.current.date(from: comps) else { return }
    if let minimumDate, next < minimumDate {
      date = minimumDate
    } else {
      date = next
    }
  }
}

/// Panel chrome used by Overview and sibling settings cards.
struct EchoSettingsPanel<Content: View>: View {
  var title: String? = nil
  var subtitle: String? = nil
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if let title {
        VStack(alignment: .leading, spacing: 4) {
          Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .textCase(.uppercase)
            .tracking(1.2)
          if let subtitle {
            Text(subtitle)
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.46))
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      content()
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.03),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.07), lineWidth: 1)
    }
  }
}

struct EchoSettingsDangerButton: View {
  let title: String
  var disabled = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.mentionPing.opacity(disabled ? 0.4 : 1))
        .padding(.horizontal, 12)
        .frame(height: 32)
        .overlay {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(EchoTheme.Color.mentionPing.opacity(disabled ? 0.2 : 0.55), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
    .disabled(disabled)
  }
}

struct EchoSettingsSecondaryButton: View {
  let title: String
  var disabled = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(disabled ? 0.3 : 0.75))
        .padding(.horizontal, 12)
        .frame(height: 32)
        .background(
          EchoTheme.Color.ink(0.06),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(disabled)
  }
}

struct EchoSettingsStatusLine: View {
  let message: String
  var isError = false

  var body: some View {
    Text(message)
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(isError ? EchoTheme.Color.mentionPing : EchoTheme.Color.presenceOnline)
      .fixedSize(horizontal: false, vertical: true)
  }
}

