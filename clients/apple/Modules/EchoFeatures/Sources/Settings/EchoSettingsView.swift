import EchoDomain
import SwiftUI

struct EchoSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  let baseURL: URL
  let accessToken: String
  let profile: EchoUserProfile?
  let onSignOut: () -> Void
  /// Inline presentations (macOS) pass a close action; sheets fall back to
  /// the environment's dismiss.
  var onClose: (() -> Void)? = nil
  #if os(iOS)
    @State private var searchText = ""
    @FocusState private var searchFocused: Bool
  #endif

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    #if os(macOS)
      EchoMacSettingsView(
        baseURL: baseURL,
        accessToken: accessToken,
        onSignOut: onSignOut,
        onClose: {
          if let onClose {
            onClose()
          } else {
            dismiss()
          }
        }
      )
    #else
      phoneSettingsStack
    #endif
  }

  #if os(iOS)
    private var sections: [EchoSettingsSection] { EchoSettingsCatalog.sections }

    private var phoneSettingsStack: some View {
      NavigationStack {
        ScrollView(showsIndicators: false) {
          VStack(spacing: 0) {
            EchoSettingsHeader(
              profile: profile,
              baseURL: baseURL,
              accessToken: accessToken,
              searchText: $searchText,
              searchFocused: $searchFocused,
              onDone: {
                if let onClose {
                  onClose()
                } else {
                  dismiss()
                }
              }
            )

            VStack(alignment: .leading, spacing: 26) {
              if filteredSections.isEmpty {
                EchoSettingsEmptyState(query: searchText) {
                  searchText = ""
                  searchFocused = false
                }
              } else {
                ForEach(filteredSections) { section in
                  VStack(alignment: .leading, spacing: 9) {
                    Text(section.title.uppercased()).font(
                      .system(size: 11, weight: .medium, design: .rounded)
                    ).tracking(1.6).foregroundStyle(EchoTheme.Color.ink(0.38)).padding(
                      .horizontal, 24)
                    VStack(spacing: 1) {
                      ForEach(section.rows) { row in
                        EchoSettingsRowView(
                          row: row, baseURL: baseURL, accessToken: accessToken, profile: profile,
                          onSignOut: onSignOut)
                      }
                    }
                    .padding(.vertical, 5)
                    .padding(.horizontal, 6)
                    .echoGlassBackground(cornerRadius: 22, opacity: 0.72)
                    .overlay(
                      RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(
                        EchoTheme.Color.ink(0.075))
                    )
                    .padding(.horizontal, 12)
                  }
                }
              }
            }
            .padding(.top, 18)
            .padding(.bottom, 30)
          }
        }
        .scrollDismissesKeyboard(.immediately)
        .background(EchoSettingsBackdrop().ignoresSafeArea())
        .scrollContentBackground(.hidden)
        .navigationTitle("")
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
      }
    }

    private var filteredSections: [EchoSettingsSection] {
      let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !query.isEmpty else { return sections }
      return sections.compactMap { section in
        let rows = section.rows.filter {
          $0.title.localizedCaseInsensitiveContains(query)
            || $0.subtitle.localizedCaseInsensitiveContains(query)
        }
        return rows.isEmpty ? nil : EchoSettingsSection(title: section.title, rows: rows)
      }
    }
  #endif
}

#if os(iOS)
  private struct EchoSettingsHeader: View {
    let profile: EchoUserProfile?
    let baseURL: URL
    var accessToken: String? = nil
    @Binding var searchText: String
    @FocusState.Binding var searchFocused: Bool
    let onDone: () -> Void

    var body: some View {
      VStack(spacing: 16) {
        EchoSettingsHero(
          profile: profile, baseURL: baseURL, accessToken: accessToken, onDone: onDone)

        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          TextField(EchoCopy.string("Search settings"), text: $searchText)
            .font(.system(size: 15, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .tint(EchoTheme.Color.fg)
            .textFieldStyle(.plain)
            .focused($searchFocused)
            .submitLabel(.search)
            .accessibilityLabel(EchoCopy.string("Search Echo settings"))
          if !searchText.isEmpty {
            Button {
              searchText = ""
              searchFocused = true
            } label: {
              Image(systemName: "xmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(EchoCopy.string("Clear settings search"))
          }
        }
        .padding(.horizontal, 15)
        .frame(height: 48)
        .background(
          EchoTheme.Color.ink(0.075), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(EchoTheme.Color.ink(0.10))
        }
        .padding(.horizontal, 18)
      }
      .padding(.top, 36)
      .padding(.bottom, 16)
    }
  }

  private struct EchoSettingsEmptyState: View {
    let query: String
    let onClear: () -> Void

    var body: some View {
      VStack(spacing: 12) {
        Image(systemName: "sparkle.magnifyingglass")
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(.cyan)
          .frame(width: 52, height: 52)
          .background(.cyan.opacity(0.13), in: Circle())
        EchoCopy.text("No settings found")
          .font(.system(size: 17, weight: .bold, design: .rounded))
        Text(EchoCopy.format("Echo couldn’t find anything matching “%@”", query))
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .multilineTextAlignment(.center)
        Button(EchoCopy.string("Clear search"), action: onClear)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(.cyan)
          .padding(.horizontal, 16)
          .frame(minHeight: 38)
          .background(.cyan.opacity(0.11), in: Capsule())
          .overlay { Capsule().stroke(.cyan.opacity(0.25), lineWidth: 1) }
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 34)
      .padding(.horizontal, 20)
      .echoGlassBackground(cornerRadius: 22)
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.09), lineWidth: 1)
      }
      .padding(.horizontal, 18)
    }
  }

  private struct EchoSettingsHero: View {
    let profile: EchoUserProfile?
    let baseURL: URL
    var accessToken: String? = nil
    let onDone: () -> Void

    var body: some View {
      HStack(spacing: 14) {
        if let profile {
          EchoMediaImage(
            source: profile.avatarURL, baseURL: baseURL, accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: profile.name, seed: profile.name)
          }
          .frame(width: 52, height: 52)
          .clipShape(Circle())
        } else {
          Image(systemName: "gearshape.fill")
            .font(.system(size: 21, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.9))
            .frame(width: 52, height: 52)
            .background(EchoTheme.Color.ink(0.10), in: Circle())
        }
        VStack(alignment: .leading, spacing: 4) {
          EchoCopy.text("Settings")
            .font(.system(size: 31, weight: .bold, design: .rounded))
          Text(
            profile.map { EchoCopy.format("Tune Echo for %@.", $0.name) }
              ?? EchoCopy.string("Make Echo feel like yours.")
          )
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        Spacer(minLength: 0)
        Button(EchoCopy.string("Done"), action: onDone)
          .font(.system(size: 16, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.88))
          .padding(.horizontal, 18)
          .frame(height: 42)
          .background(EchoTheme.Color.ink(0.075), in: Capsule())
          .overlay {
            Capsule().stroke(EchoTheme.Color.ink(0.10), lineWidth: 1)
          }
      }
      .padding(.horizontal, 22)
    }
  }
#endif

struct EchoSettingsBackdrop: View {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    return ZStack {
      displayPrefs.canvas(colorScheme: colorScheme)
      RadialGradient(
        colors: [Color.indigo.opacity(0.20), .clear],
        center: .topTrailing,
        startRadius: 20,
        endRadius: 360
      )
      RadialGradient(
        colors: [Color.purple.opacity(0.10), .clear],
        center: .bottomLeading,
        startRadius: 10,
        endRadius: 300
      )
    }
  }
}
