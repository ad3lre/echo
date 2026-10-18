import SwiftUI

/// Shared ringtone list used by Settings and the in-call picker.
struct EchoRingtonePickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var store: EchoCallRingtoneStore
  var showsDoneButton = true

  var body: some View {
    NavigationStack {
      List {
        ForEach(EchoRingtonePack.allCases) { pack in
          Section(pack.rawValue) {
            ForEach(EchoRingtoneCatalog.entries(in: pack)) { entry in
              Button {
                store.selectAndHear(entry)
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
        if showsDoneButton {
          ToolbarItem(placement: .cancellationAction) {
            Button(EchoCopy.string("Done")) { dismiss() }
          }
        }
      }
    }
  }
}

/// Compact top panel for picking / muting the ringtone while a call is ringing.
struct EchoCallRingtonePanel: View {
  @Bindable var store: EchoCallRingtoneStore
  let onToggleMute: () -> Void
  let onClose: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        EchoCopy.text("Ringtones")
          .font(.system(size: 16, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
        Spacer()
        Button(action: onToggleMute) {
          Image(systemName: store.muted ? "bell.slash.fill" : "bell.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.9))
            .frame(width: 34, height: 34)
            .background(.white.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          store.muted
            ? EchoCopy.string("Unmute ringtone")
            : EchoCopy.string("Mute ringtone"))
        Button(action: onClose) {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(.white.opacity(0.85))
            .frame(width: 34, height: 34)
            .background(.white.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close"))
      }
      .padding(.horizontal, 16)
      .padding(.top, 14)
      .padding(.bottom, 10)

      EchoRingtonePickerSheet(store: store, showsDoneButton: false)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .frame(maxHeight: 320)
        .preferredColorScheme(.dark)
    }
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .strokeBorder(.white.opacity(0.12), lineWidth: 1)
    }
    .padding(.horizontal, 14)
    .echoShadow(color: .black.opacity(0.35), radius: 24, y: 10)
  }
}
