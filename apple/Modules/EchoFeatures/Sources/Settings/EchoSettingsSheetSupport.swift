import SwiftUI
import UniformTypeIdentifiers

/// JSON payload written through the system file exporter for Data & Privacy.
struct EchoDataExportDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }

  var data: Data

  init(data: Data) {
    self.data = data
  }

  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }

  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}

struct EchoSettingsSheetShell<Content: View>: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color
  let onCancel: () -> Void
  @ViewBuilder let content: () -> Content

  init(
    title: String, description: String, icon: String, tint: Color, onCancel: @escaping () -> Void,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.title = title
    self.description = description
    self.icon = icon
    self.tint = tint
    self.onCancel = onCancel
    self.content = content
  }

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 20) {
          EchoSheetHeader(title: title, description: description, icon: icon, tint: tint)
          content()
        }
        .padding(20)
        .padding(.bottom, 28)
      }
      .background(EchoSettingsBackdrop().ignoresSafeArea())
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
      }
      .tint(.white)
    }
  }
}

struct EchoSettingsSheetField: View {
  let title: String
  let icon: String
  let tint: Color
  @Binding var value: String
  var isSecure = false
  var keyboard: EchoSettingsKeyboard = .default

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(title.uppercased(), systemImage: icon)
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .tracking(1.4)
        .foregroundStyle(tint.opacity(0.85))
      Group {
        if isSecure {
          SecureField(title, text: $value)
        } else {
          TextField(title, text: $value)
        }
      }
      .font(.system(size: 16, weight: .medium, design: .rounded))
      .foregroundStyle(.white)
      .padding(.horizontal, 15)
      .frame(minHeight: 52)
      .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(.white.opacity(0.12), lineWidth: 1)
      }
      #if os(iOS)
        .textInputAutocapitalization(.never)
        .keyboardType(uiKeyboardType)
      #endif
    }
  }

  #if os(iOS)
    private var uiKeyboardType: UIKeyboardType {
      switch keyboard {
      case .default: .default
      case .numberPad: .numberPad
      case .emailAddress: .emailAddress
      case .phonePad: .phonePad
      }
    }
  #endif
}

enum EchoSettingsKeyboard {
  case `default`
  case numberPad
  case emailAddress
  case phonePad
}

struct EchoSheetHeader: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: icon)
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 48, height: 48)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
      VStack(alignment: .leading, spacing: 5) {
        Text(title)
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
        Text(description)
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(.white.opacity(0.54))
      }
      Spacer(minLength: 0)
    }
  }
}
