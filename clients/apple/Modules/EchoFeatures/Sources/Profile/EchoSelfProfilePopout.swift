import EchoDomain
import EchoNetworking
import SwiftUI

#if os(macOS)
  /// Web `SelfProfilePopout` — custom status + quick presence only.
  struct EchoSelfProfilePopout: View {
    let presenceStatus: String
    let baseURL: URL
    let accessToken: String
    let onSelectPresence: (String) -> Void
    let onOpenSettings: () -> Void
    let onReportBug: () -> Void
    let onDismiss: () -> Void

    @State private var customStatus = ""
    @State private var originalCustomStatus = ""
    @State private var isEditingCustomStatus = false
    @State private var selectedPresence = ""
    @FocusState private var statusFocused: Bool
    @State private var saveTask: Task<Void, Never>?

    private let statusMax = 140

    private let presenceOptions: [(id: String, label: String, description: String)] = [
      (
        "online", EchoCopy.string("Online"),
        EchoCopy.string("Visible as available")
      ),
      (
        "idle", EchoCopy.string("Idle"),
        EchoCopy.string("Away from Echo for a bit")
      ),
      (
        "do_not_disturb", EchoCopy.string("Do Not Disturb"),
        EchoCopy.string("Mute notifications and mark busy")
      ),
    ]

    var body: some View {
      ZStack(alignment: .bottomLeading) {
        Color.black.opacity(0.001)
          .ignoresSafeArea()
          .onTapGesture(perform: onDismiss)

        VStack(alignment: .leading, spacing: 10) {
          customStatusPanel
          presencePanel
          reportBugRow
        }
        .frame(width: 320)
        .padding(.leading, 16)
        .padding(.bottom, 18)
      }
      .onAppear {
        if selectedPresence.isEmpty {
          selectedPresence = Self.canonical(presenceStatus)
        }
      }
      .task { await loadCustomStatus() }
    }

    private var customStatusPanel: some View {
      VStack(alignment: .leading, spacing: 10) {
        Text(EchoCopy.string("CUSTOM STATUS"))
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .tracking(1.6)
          .foregroundStyle(EchoTheme.Color.ink(0.45))

        Button {
          beginCustomStatusEdit()
        } label: {
          HStack(alignment: .top, spacing: 10) {
            Image(systemName: "quote.opening")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.4))
              .padding(.top, 2)
            Group {
              if isEditingCustomStatus {
                TextField(
                  EchoCopy.string("What’s up?"),
                  text: $customStatus,
                  axis: .vertical
                )
                .font(.system(size: 14, design: .rounded))
                .textFieldStyle(.plain)
                .focused($statusFocused)
                .lineLimit(1...6)
                .onChange(of: customStatus) { _, next in
                  if next.count > statusMax {
                    customStatus = String(next.prefix(statusMax))
                  }
                }
                .onSubmit { commitCustomStatus() }
              } else {
                Text(
                  customStatus.isEmpty
                    ? EchoCopy.string("Set a custom status")
                    : customStatus
                )
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(
                  customStatus.isEmpty
                    ? EchoTheme.Color.ink(0.42) : EchoTheme.Color.ink(0.88)
                )
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
              }
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(EchoQuietRowButtonStyle())
      }
      .padding(16)
      .background { popoutPanelBackground }
    }

    private var reportBugRow: some View {
      Button(action: onReportBug) {
        HStack(spacing: 10) {
          Image(systemName: "ladybug")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 20)
          Text(EchoCopy.string("Report a bug"))
            .font(.system(size: 13.5, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.9))
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
      }
      .buttonStyle(EchoQuietRowButtonStyle())
      .background { popoutPanelBackground }
    }

    private var presencePanel: some View {
      VStack(alignment: .leading, spacing: 4) {
        Text(EchoCopy.string("ONLINE STATUS"))
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .tracking(1.6)
          .foregroundStyle(EchoTheme.Color.ink(0.45))
          .padding(.bottom, 6)

        ForEach(Array(presenceOptions.prefix(2)), id: \.id) { option in
          presenceRow(option)
        }

        HStack(spacing: 4) {
          if let dnd = presenceOptions.last {
            presenceRow(dnd)
          }
          Button(action: onOpenSettings) {
            Image(systemName: "pencil")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.62))
              .frame(width: 40, height: 44)
          }
          .buttonStyle(EchoQuietRowButtonStyle())
          .help(EchoCopy.string("Edit profile"))
          .accessibilityLabel(EchoCopy.string("Edit profile"))
        }
      }
      .padding(16)
      .background { popoutPanelBackground }
    }

    private func presenceRow(
      _ option: (id: String, label: String, description: String)
    ) -> some View {
      let selected = selectedPresence == option.id
      return Button {
        selectedPresence = option.id
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
          onSelectPresence(option.id)
        }
      } label: {
        HStack(spacing: 10) {
          EchoPresenceIndicator(status: option.id, size: 12, showsHalo: false)
            .frame(width: 20, height: 20)
          VStack(alignment: .leading, spacing: 1) {
            Text(option.label)
              .font(.system(size: 13.5, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.9))
            Text(option.description)
              .font(.system(size: 11.5, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.42))
              .lineLimit(1)
          }
          Spacer(minLength: 4)
          Image(systemName: "checkmark")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(EchoTheme.Color.signInBlue)
            .opacity(selected ? 1 : 0)
            .frame(width: 14)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
          selected
            ? EchoTheme.Color.signInBlue.opacity(0.12)
            : Color.clear,
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .contentShape(Rectangle())
      }
      .buttonStyle(EchoQuietRowButtonStyle())
      .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var popoutPanelBackground: some View {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(.ultraThinMaterial)
    }

    private func beginCustomStatusEdit() {
      guard !isEditingCustomStatus else { return }
      isEditingCustomStatus = true
      DispatchQueue.main.async { statusFocused = true }
    }

    private func commitCustomStatus() {
      isEditingCustomStatus = false
      statusFocused = false
      let trimmed = customStatus.trimmingCharacters(in: .whitespacesAndNewlines)
      customStatus = String(trimmed.prefix(statusMax))
      guard customStatus != originalCustomStatus else { return }
      let pending = saveTask
      saveTask = Task {
        await pending?.value
        do {
          try await EchoSettingsClient(baseURL: baseURL).updateProfile(
            displayName: nil,
            username: nil,
            bio: nil,
            customStatus: customStatus,
            presenceStatus: nil,
            bannerImage: nil,
            avatarImage: nil,
            accessToken: accessToken
          )
          originalCustomStatus = customStatus
        } catch {
          customStatus = originalCustomStatus
        }
      }
    }

    private func loadCustomStatus() async {
      guard
        let identity = try? await EchoSettingsClient(baseURL: baseURL)
          .loadAccountIdentity(accessToken: accessToken)
      else { return }
      let loaded = identity.customStatus ?? ""
      customStatus = loaded
      originalCustomStatus = loaded
    }

    private static func canonical(_ status: String) -> String {
      switch status.lowercased() {
      case "dnd", "busy": "do_not_disturb"
      default: status.lowercased()
      }
    }
  }

  private struct EchoQuietRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
      configuration.label
        .opacity(configuration.isPressed ? 0.78 : 1)
    }
  }
#endif
