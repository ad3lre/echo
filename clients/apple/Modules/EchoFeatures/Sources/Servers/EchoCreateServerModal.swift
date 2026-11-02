import PhotosUI
import SwiftUI

/// Web `AddServerModal` create tab: name (required) + optional icon → `POST /servers`.
struct EchoCreateServerModal: View {
  /// Returns `(id, nil)` on success or `(nil, message)` on failure.
  var onCreate: (_ name: String, _ icon: Data?) async -> (id: String?, error: String?)
  var onCreated: (String) -> Void
  var onClose: () -> Void

  @State private var name = ""
  @State private var iconItem: PhotosPickerItem?
  @State private var iconData: Data?
  @State private var busy = false
  @State private var errorMessage: String?

  private var canCreate: Bool {
    !busy && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 440, onClose: onClose) {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          Text(EchoCopy.string("Create your server"))
            .font(.system(size: 20, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.string("Give it a name and an icon. You can change both later."))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        .padding(.trailing, 28)

        HStack(spacing: 14) {
          iconPicker
          EchoDesktopLabeledField(title: EchoCopy.string("Server name")) {
            TextField(EchoCopy.string("Server name"), text: $name)
              .onSubmit { if canCreate { Task { await create() } } }
          }
        }

        if let errorMessage {
          Text(errorMessage)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.mentionPing)
        }
        HStack {
          Spacer()
          EchoDesktopGhostButton(title: EchoCopy.string("Cancel"), action: onClose)
          EchoDesktopPrimaryButton(
            title: busy ? EchoCopy.string("Creating…") : EchoCopy.string("Create"),
            enabled: canCreate
          ) { Task { await create() } }
        }
      }
      .overlay(alignment: .topTrailing) {
        EchoGuildModalCloseButton(action: onClose).offset(x: 4, y: -4)
      }
    }
    .onChange(of: iconItem) { _, item in
      Task {
        guard let item, let raw = try? await item.loadTransferable(type: Data.self) else { return }
        iconData = EchoSettingsImage.downscaledPNG(raw, maxPixel: 512)
      }
    }
  }

  private var iconPicker: some View {
    PhotosPicker(selection: $iconItem, matching: .images) {
      Group {
        if let iconData, let image = platformImage(iconData) {
          image.resizable().scaledToFill()
        } else {
          Image(systemName: "camera.fill")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
        }
      }
      .frame(width: 64, height: 64)
      .background(
        EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
    .padding(.top, 18)
    .accessibilityLabel(EchoCopy.string("Server icon"))
  }

  private func create() async {
    busy = true
    errorMessage = nil
    let result = await onCreate(name, iconData)
    busy = false
    if let id = result.id {
      onCreated(id)
    } else {
      errorMessage = result.error
    }
  }
}
