import EchoDomain
import SwiftUI

#if os(macOS)
  /// Web-style desktop settings: sidebar nav + content pane.
  struct EchoMacSettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(EchoDisplayPreferences.self) private var displayPrefs
    let baseURL: URL
    let accessToken: String
    let onSignOut: () -> Void
    let onClose: () -> Void

    @State private var selectedRoute: EchoSettingsRoute = .account

    private var sections: [EchoSettingsSection] { EchoSettingsCatalog.sections }

    var body: some View {
      let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
      return HStack(spacing: 0) {
        sidebar
          .frame(width: 232)
          .frame(maxHeight: .infinity)
          .background(EchoTheme.Color.ink(0.035))

        detailPane
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(EchoTheme.Color.canvas.ignoresSafeArea())
      .environment(\.echoDesktopSettings, true)
      .onAppear {
        if selectedRow == nil, let first = sections.first?.rows.first {
          selectedRoute = first.route
        }
      }
    }

    private var sidebar: some View {
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 4) {
          EchoCopy.text("Settings")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
          EchoCopy.text("Make Echo feel like yours.")
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 18)

        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 20) {
            ForEach(sections) { section in
              VStack(alignment: .leading, spacing: 2) {
                Text(section.title.uppercased())
                  .font(.system(size: 11, weight: .semibold))
                  .tracking(1.5)
                  .foregroundStyle(EchoTheme.Color.ink(0.42))
                  .padding(.horizontal, 20)
                  .padding(.bottom, 4)

                ForEach(section.rows) { row in
                  sidebarItem(row)
                }
              }
            }
          }
          .padding(.bottom, 28)
        }
      }
    }

    private func sidebarItem(_ row: EchoSettingsRow) -> some View {
      let selected = selectedRoute == row.route
      return Button {
        selectedRoute = row.route
      } label: {
        HStack(spacing: 10) {
          EchoSettingsBrandIcon(row: row, compact: true)
            .frame(width: 16, height: 16)
            .opacity(selected ? 0.95 : 0.55)
          Text(row.title)
            .font(.system(size: 13.5, weight: selected ? .semibold : .medium))
            .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.58))
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
          selected
            ? EchoTheme.Color.signInBlue.opacity(0.16)
            : Color.clear,
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .padding(.horizontal, 8)
      .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private var detailPane: some View {
      if let row = selectedRow {
        EchoSettingDetailView(
          route: row.route,
          icon: row.icon,
          tint: row.tint,
          baseURL: baseURL,
          accessToken: accessToken,
          onSignOut: onSignOut,
          chrome: .desktop,
          onClose: onClose
        )
        .id(row.route)
      } else {
        EchoCopy.text("Select a setting")
          .font(.system(size: 14))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }

    private var selectedRow: EchoSettingsRow? {
      for section in sections {
        if let row = section.rows.first(where: { $0.route == selectedRoute }) {
          return row
        }
      }
      return nil
    }
  }
#endif
