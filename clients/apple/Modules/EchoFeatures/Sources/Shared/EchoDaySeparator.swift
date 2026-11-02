import SwiftUI

/// Web `formatMessageListDaySeparatorLabel`: Today / Yesterday / weekday long date.
enum EchoDaySeparatorLabel {
  static func text(for date: Date, now: Date = Date()) -> String {
    let calendar = Calendar.current
    if calendar.isDate(date, inSameDayAs: now) {
      return EchoCopy.string("Today")
    }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
      calendar.isDate(date, inSameDayAs: yesterday)
    {
      return EchoCopy.string("Yesterday")
    }
    return longFormatter.string(from: date)
  }

  static func shouldShow(at index: Int, previous: Date?, current: Date?) -> Bool {
    guard current != nil else { return false }
    if index == 0 { return true }
    guard let previous, let current else { return true }
    return !Calendar.current.isDate(previous, inSameDayAs: current)
  }

  private static let longFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMdyyyy")
    return formatter
  }()
}

/// Hairline + uppercase label used in chat and the mentions inbox.
struct EchoDaySeparator: View {
  let date: Date
  var isFirst = false

  var body: some View {
    let label = EchoDaySeparatorLabel.text(for: date)
    HStack(spacing: 12) {
      line
      Text(label)
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .tracking(0.6)
        .textCase(.uppercase)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .lineLimit(1)
      line
    }
    .padding(.horizontal, 16)
    .padding(.top, isFirst ? 16 : 10)
    .padding(.bottom, isFirst ? 10 : 8)
    .accessibilityAddTraits(.isHeader)
    .accessibilityLabel(label)
  }

  private var line: some View {
    Rectangle()
      .fill(EchoTheme.Color.glass2)
      .frame(height: 1)
      .frame(maxWidth: .infinity)
  }
}
