import EchoNetworking
import SwiftUI
import UniformTypeIdentifiers

/// Shared ringtone list used by Settings and the in-call picker.
struct EchoRingtonePickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth
  @Bindable var store: EchoCallRingtoneStore
  var baseURL: URL? = nil
  var showsDoneButton = true
  @State private var isImporterPresented = false
  @State private var isUploading = false

  private var resolvedBaseURL: URL { baseURL ?? auth.apiBaseURL }

  var body: some View {
    NavigationStack {
      List {
        if !store.customRingtones.isEmpty || store.maxCustom > 0 {
          Section(EchoCopy.string("Custom")) {
            ForEach(store.customRingtones) { ringtone in
              Button {
                store.selectAndHearCustom(ringtone)
              } label: {
                HStack {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(ringtone.label)
                      .font(.system(size: 15, weight: .semibold, design: .rounded))
                      .foregroundStyle(.primary)
                    Text(EchoCopy.string("Synced"))
                      .font(.system(size: 12, design: .rounded))
                      .foregroundStyle(.secondary)
                  }
                  Spacer()
                  if store.selectedStorageID == ringtone.id {
                    Image(systemName: "checkmark.circle.fill")
                      .foregroundStyle(.pink)
                  }
                }
              }
              .buttonStyle(.plain)
              .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) {
                  Task {
                    await store.deleteCustom(
                      ringtone, baseURL: resolvedBaseURL, auth: auth)
                  }
                } label: {
                  Label(EchoCopy.string("Delete"), systemImage: "trash")
                }
              }
            }
            if store.canUploadCustom {
              Button {
                isImporterPresented = true
              } label: {
                HStack {
                  if isUploading {
                    ProgressView()
                  } else {
                    Image(systemName: "plus.circle.fill")
                      .foregroundStyle(.pink)
                  }
                  Text(EchoCopy.string("Upload ringtone"))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                }
              }
              .disabled(isUploading)
            } else if store.maxCustom > 0 {
              Text(EchoCopy.format("Custom limit reached (%lld)", store.maxCustom))
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(.secondary)
            }
          }
        }

        ForEach(EchoRingtonePack.allCases) { pack in
          Section(pack.rawValue) {
            ForEach(EchoRingtoneCatalog.entries(in: pack)) { entry in
              Button {
                store.selectAndHearBuiltin(entry)
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
                  if store.selectedBuiltinEntry?.id == entry.id {
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
      .task {
        await store.refreshCustoms(baseURL: resolvedBaseURL, auth: auth)
      }
      .fileImporter(
        isPresented: $isImporterPresented,
        allowedContentTypes: [.audio, .mpeg4Audio, .wav],
        allowsMultipleSelection: false
      ) { result in
        guard case .success(let urls) = result, let url = urls.first else { return }
        Task { await importFile(url, baseURL: resolvedBaseURL) }
      }
    }
  }

  private func importFile(_ url: URL, baseURL: URL) async {
    isUploading = true
    defer { isUploading = false }
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? Data(contentsOf: url) else { return }
    let mime =
      UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "audio/mpeg"
    await store.uploadCustom(
      data: data,
      filename: url.lastPathComponent,
      mimeType: mime,
      baseURL: baseURL,
      auth: auth)
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
  }
}
