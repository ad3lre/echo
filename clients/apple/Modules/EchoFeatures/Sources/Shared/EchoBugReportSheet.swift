import EchoNetworking
import PhotosUI
import SwiftUI

/// Web `BugReportModal` — free-text description plus an optional screenshot (`POST /bug-reports`).
struct EchoBugReportSheet: View {
  let accessToken: String
  let baseURL: URL
  var onFinished: (() -> Void)? = nil

  @Environment(\.dismiss) private var dismiss
  @State private var description = ""
  @State private var screenshotItem: PhotosPickerItem?
  @State private var screenshot: Data?
  @State private var isSubmitting = false
  @State private var submitted = false
  @State private var error: String?

  private static let maxDescription = 8000

  private var canSubmit: Bool {
    !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSubmitting
      && !submitted
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider().overlay(EchoTheme.Color.ink(0.08))
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          VStack(alignment: .leading, spacing: 8) {
            sectionLabel(EchoCopy.string("What happened?"))
            TextField(
              EchoCopy.string("Steps, what you expected, what you saw instead…"),
              text: $description, axis: .vertical
            )
            .font(.system(size: 14, design: .rounded))
            .lineLimit(5...12)
            .padding(12)
            .background(
              EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .onChange(of: description) { _, next in
              if next.count > Self.maxDescription {
                description = String(next.prefix(Self.maxDescription))
              }
            }
          }
          screenshotSection
          if let error {
            Text(error)
              .font(.system(size: 13, design: .rounded))
              .foregroundStyle(EchoTheme.Color.mentionPing)
          }
        }
        .padding(20)
      }
      Divider().overlay(EchoTheme.Color.ink(0.08))
      footer
    }
    #if os(macOS)
      .frame(minWidth: 440, minHeight: 440)
    #endif
    .background(EchoTheme.Color.elevatedDeep)
    .onChange(of: screenshotItem) { _, item in
      guard let item else { return }
      Task { await loadScreenshot(item) }
    }
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "ladybug.fill")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(Color.orange.opacity(0.9))
        .frame(width: 40, height: 40)
        .background(
          Color.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      VStack(alignment: .leading, spacing: 4) {
        Text(EchoCopy.string("Report a bug"))
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(EchoCopy.string("Tell us what went wrong. Echo’s team reads every report."))
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      Spacer(minLength: 8)
      Button { dismiss() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(isSubmitting)
      .accessibilityLabel(EchoCopy.string("Cancel"))
    }
    .padding(20)
  }

  private var screenshotSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      sectionLabel(EchoCopy.string("Screenshot (optional)"))
      HStack(spacing: 10) {
        if let screenshot, let preview = Self.previewImage(screenshot) {
          preview
            .resizable()
            .scaledToFill()
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
          Button(EchoCopy.string("Remove")) {
            self.screenshot = nil
            screenshotItem = nil
          }
          .buttonStyle(.plain)
          .foregroundStyle(EchoTheme.Color.mentionPing)
          .disabled(isSubmitting)
        } else {
          PhotosPicker(selection: $screenshotItem, matching: .images) {
            Label(EchoCopy.string("Attach screenshot"), systemImage: "photo")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.75))
              .padding(.horizontal, 12)
              .frame(height: 32)
              .background(
                EchoTheme.Color.ink(0.06),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
          .buttonStyle(.plain)
          .disabled(isSubmitting)
        }
        Spacer(minLength: 0)
      }
    }
  }

  private var footer: some View {
    HStack {
      Button(EchoCopy.string("Cancel")) { dismiss() }
        .buttonStyle(.plain)
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .disabled(isSubmitting)
      Spacer()
      Button(action: submit) {
        HStack(spacing: 8) {
          if isSubmitting { ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent) }
          Text(
            isSubmitting
              ? EchoCopy.string("Sending…")
              : submitted ? EchoCopy.string("Report sent") : EchoCopy.string("Send report")
          )
          .font(.system(size: 14, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(EchoTheme.Color.onAccent)
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(
          EchoTheme.Color.signInBlue.opacity(canSubmit || submitted ? 1 : 0.45),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!canSubmit)
    }
    .padding(16)
  }

  private func sectionLabel(_ title: String) -> some View {
    Text(title)
      .font(.system(size: 12, weight: .bold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.45))
      .textCase(.uppercase)
      .tracking(0.6)
  }

  private func loadScreenshot(_ item: PhotosPickerItem) async {
    guard let raw = try? await item.loadTransferable(type: Data.self),
      let jpeg = EchoSettingsImage.downscaledJPEG(raw, maxPixel: 2400, quality: 0.8)
    else {
      error = EchoCopy.string("Echo couldn’t read that image.")
      return
    }
    error = nil
    screenshot = jpeg
  }

  private func submit() {
    guard canSubmit else { return }
    error = nil
    isSubmitting = true
    let text = description
    let image = screenshot
    Task {
      do {
        let client = EchoWorkspaceClient(baseURL: baseURL)
        var urls: [String] = []
        if let image {
          urls.append(
            try await client.uploadBugReportAttachment(
              data: image, filename: "screenshot.jpg", mimeType: "image/jpeg",
              accessToken: accessToken))
        }
        try await client.submitBugReport(
          description: text, attachmentURLs: urls, accessToken: accessToken)
        isSubmitting = false
        submitted = true
        try? await Task.sleep(for: .milliseconds(700))
        onFinished?()
        dismiss()
      } catch {
        isSubmitting = false
        self.error = echoSettingsErrorMessage(
          error, fallback: EchoCopy.string("Echo couldn’t send your bug report."))
      }
    }
  }

  private static func previewImage(_ data: Data) -> Image? {
    #if canImport(UIKit)
      UIImage(data: data).map(Image.init(uiImage:))
    #else
      NSImage(data: data).map(Image.init(nsImage:))
    #endif
  }
}
