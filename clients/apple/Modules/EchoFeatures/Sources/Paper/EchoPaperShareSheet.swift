import EchoDomain
import SwiftUI

/// Share visibility + copyable link for a paper channel (web paper share chrome).
struct EchoPaperShareSheet: View {
  @Bindable var model: EchoPaperShareModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Group {
        if model.isLoading && model.settings == nil {
          ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.errorMessage, model.settings == nil {
          VStack(spacing: 12) {
            Text(error)
              .font(.system(size: 15, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.8))
              .multilineTextAlignment(.center)
            Button(EchoCopy.string("Try again")) { Task { await model.reload() } }
              .buttonStyle(.bordered)
          }
          .padding(24)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let settings = model.settings {
          Form {
            Section {
              ForEach(EchoPaperShareVisibility.allCases, id: \.self) { visibility in
                visibilityRow(visibility, settings: settings)
              }
            } header: {
              Text(EchoCopy.string("Who can open this paper"))
            } footer: {
              Text(settings.audience.detail)
                .font(.system(size: 12, design: .rounded))
            }

            Section(EchoCopy.string("Link")) {
              Text(model.shareLink)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(EchoTheme.Color.ink(0.72))
                .textSelection(.enabled)
              Button {
                model.copyLink()
              } label: {
                Label(
                  EchoCopy.string(model.didCopyLink ? "Copied" : "Copy link"),
                  systemImage: model.didCopyLink ? "checkmark" : "link")
              }
              .disabled(model.shareLink.isEmpty)
            }

            if let error = model.errorMessage {
              Section {
                Text(error).foregroundStyle(EchoTheme.Color.mentionPing)
              }
            }
          }
          .disabled(model.isSaving)
        }
      }
      .navigationTitle(EchoCopy.string("Share paper"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
        if model.isSaving {
          ToolbarItem(placement: .primaryAction) {
            ProgressView().controlSize(.small)
          }
        }
      }
      .task { await model.reload() }
    }
    #if os(macOS)
      .frame(minWidth: 420, minHeight: 420)
    #endif
  }

  @ViewBuilder
  private func visibilityRow(
    _ visibility: EchoPaperShareVisibility, settings: EchoPaperShareSettings
  ) -> some View {
    let selected = settings.visibility == visibility
    Button {
      Task { await model.setVisibility(visibility) }
    } label: {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(selected ? EchoTheme.Color.indigoSoft : EchoTheme.Color.ink(0.35))
          .font(.system(size: 18, weight: .semibold))
        VStack(alignment: .leading, spacing: 2) {
          Text(title(for: visibility))
            .font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
          Text(subtitle(for: visibility))
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!settings.canManageShare || model.isSaving)
    .opacity(settings.canManageShare ? 1 : 0.55)
  }

  private func title(for visibility: EchoPaperShareVisibility) -> String {
    switch visibility {
    case .server: EchoCopy.string("Server members")
    case .private: EchoCopy.string("Authors only")
    case .global: EchoCopy.string("Anyone with the link")
    }
  }

  private func subtitle(for visibility: EchoPaperShareVisibility) -> String {
    switch visibility {
    case .server:
      EchoCopy.string("Members who can view this channel under server roles.")
    case .private:
      EchoCopy.string("Only members with Author in paper on this channel.")
    case .global:
      EchoCopy.string("Anyone on the internet can view this document (read-only).")
    }
  }
}
