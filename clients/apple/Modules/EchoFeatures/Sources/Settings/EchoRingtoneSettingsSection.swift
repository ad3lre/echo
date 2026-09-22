import SwiftUI

/// Call ringtone picker — packs + preview, matching web Notifications ringtone UI.
struct EchoRingtoneSettingsSection: View {
  @Bindable private var store = EchoCallRingtoneStore.shared
  @State private var isPickerPresented = false

  var body: some View {
    EchoDetailSection(title: EchoCopy.string("Call ringtone")) {
      VStack(alignment: .leading, spacing: 0) {
        Button {
          isPickerPresented = true
        } label: {
          HStack(spacing: 12) {
            Image(systemName: "bell.and.waves.left.and.right.fill")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(.pink)
              .frame(width: 36, height: 36)
              .background(
                Color.pink.opacity(0.14),
                in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
              Text(EchoCopy.string("Default ringtone"))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(.primary)
              Text(store.selectedEntry.label)
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.up.chevron.down")
              .font(.system(size: 10, weight: .bold))
              .foregroundStyle(.secondary)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        Rectangle()
          .fill(EchoTheme.Color.ink(0.08))
          .frame(height: 1)
          .padding(.vertical, 16)

        EchoSettingToggle(
          title: EchoCopy.string("Mute ringtone"),
          subtitle: EchoCopy.string("Silence the in-app call ringtone"),
          icon: "bell.slash.fill",
          tint: .orange,
          isOn: $store.muted,
          showsIcon: true
        )

        Rectangle()
          .fill(EchoTheme.Color.ink(0.08))
          .frame(height: 1)
          .padding(.vertical, 16)

        EchoSettingSlider(
          title: EchoCopy.string("Ringtone volume"),
          icon: "speaker.wave.2",
          tint: EchoTheme.Color.ink(0.82),
          value: $store.volumePercent,
          range: 0...100,
          showsIcon: true
        )
        .disabled(store.muted)
        .opacity(store.muted ? 0.45 : 1)

        Rectangle()
          .fill(EchoTheme.Color.ink(0.08))
          .frame(height: 1)
          .padding(.vertical, 16)

        EchoSettingAction(
          title: EchoCopy.string("Preview ringtone"),
          subtitle: EchoCopy.string("Play the selected built-in ringtone once"),
          icon: "play.fill",
          tint: .pink
        ) {
          store.previewSelected()
        }
        .disabled(store.muted)
        .opacity(store.muted ? 0.45 : 1)
      }
    }
    .sheet(isPresented: $isPickerPresented) {
      EchoRingtonePickerSheet(store: store)
    }
  }
}

private struct EchoRingtonePickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var store: EchoCallRingtoneStore

  var body: some View {
    NavigationStack {
      List {
        ForEach(EchoRingtonePack.allCases) { pack in
          Section(pack.rawValue) {
            ForEach(EchoRingtoneCatalog.entries(in: pack)) { entry in
              Button {
                store.select(entry)
                store.previewSelected()
              } label: {
                HStack {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(entry.label)
                      .font(.system(size: 15, weight: .semibold, design: .rounded))
                      .foregroundStyle(.primary)
                    Text(pack.rawValue)
                      .font(.system(size: 12, design: .rounded))
                      .foregroundStyle(.secondary)
                  }
                  Spacer()
                  if store.selectedEntry.id == entry.id {
                    Image(systemName: "checkmark.circle.fill")
                      .foregroundStyle(.pink)
                  }
                }
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .navigationTitle(EchoCopy.string("Ringtones"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
      }
    }
  }
}
