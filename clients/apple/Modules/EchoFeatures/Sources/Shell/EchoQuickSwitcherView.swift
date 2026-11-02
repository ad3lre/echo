import SwiftUI

/// Command-palette overlay: type to filter servers, channels, and DMs; ↑/↓ move,
/// Return jumps, Esc closes. Data comes pre-indexed from the shell.
struct EchoQuickSwitcherView: View {
  let items: [EchoQuickSwitcherItem]
  let onSelect: (EchoQuickSwitcherItem) -> Void
  let onDismiss: () -> Void

  @State private var query = ""
  @State private var selectedID: String?
  @FocusState private var fieldFocused: Bool

  private var results: [EchoQuickSwitcherItem] {
    EchoQuickSwitcherIndex.search(items, query: query)
  }

  var body: some View {
    ZStack(alignment: .top) {
      Color.black.opacity(0.38)
        .ignoresSafeArea()
        .onTapGesture(perform: onDismiss)
      VStack(spacing: 0) {
        field
        Divider().overlay(EchoTheme.Color.hairline)
        list
      }
      .frame(width: 560)
      .background(
        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.regularMaterial)
      )
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .echoShadow(color: .black.opacity(0.4), radius: 28, y: 12)
      .padding(.top, 90)
    }
    .onAppear { fieldFocused = true }
    .onChange(of: query, initial: true) { _, _ in selectedID = results.first?.id }
    #if os(macOS)
      .onExitCommand(perform: onDismiss)
    #endif
  }

  private var field: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      TextField(
        EchoCopy.string("Where would you like to go?"), text: $query
      )
      .textFieldStyle(.plain)
      .font(.system(size: 17))
      .focused($fieldFocused)
      .onSubmit(openSelected)
      .onKeyPress(.downArrow) { move(1) }
      .onKeyPress(.upArrow) { move(-1) }
    }
    .padding(.horizontal, 16)
    .frame(height: 52)
  }

  @ViewBuilder
  private var list: some View {
    let rows = results
    if rows.isEmpty {
      Text(EchoCopy.string("No matching servers, channels, or DMs"))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .frame(maxWidth: .infinity)
        .frame(height: 96)
    } else {
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 2) {
            ForEach(rows) { item in row(item) }
          }
          .padding(8)
        }
        .frame(maxHeight: 380)
        .onChange(of: selectedID) { _, id in
          if let id { proxy.scrollTo(id) }
        }
      }
    }
  }

  private func row(_ item: EchoQuickSwitcherItem) -> some View {
    let selected = item.id == selectedID
    return Button { onSelect(item) } label: {
      HStack(spacing: 10) {
        Image(systemName: item.symbol)
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.6))
          .frame(width: 22)
        Text(item.title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
        if let subtitle = item.subtitle {
          Text(subtitle)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Text(Self.kindLabel(item.kind))
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.4))
      }
      .padding(.horizontal, 10)
      .frame(height: 36)
      .background(
        selected ? EchoTheme.Color.ink(0.10) : Color.clear,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .id(item.id)
  }

  static func kindLabel(_ kind: EchoQuickSwitcherItem.Kind) -> String {
    switch kind {
    case .dm: EchoCopy.string("Direct message")
    case .server: EchoCopy.string("Server")
    case .channel: EchoCopy.string("Channel")
    }
  }

  private func move(_ delta: Int) -> KeyPress.Result {
    let rows = results
    guard !rows.isEmpty else { return .handled }
    let current = rows.firstIndex { $0.id == selectedID } ?? 0
    selectedID = rows[min(max(current + delta, 0), rows.count - 1)].id
    return .handled
  }

  private func openSelected() {
    let rows = results
    guard let item = rows.first(where: { $0.id == selectedID }) ?? rows.first else { return }
    onSelect(item)
  }
}
