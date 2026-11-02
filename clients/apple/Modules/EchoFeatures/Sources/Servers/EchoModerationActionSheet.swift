import EchoDomain
import SwiftUI

/// Web `ModerationActionModal` — timeout presets / temp ban / reason / message purge.
struct EchoModerationActionSheet: View {
  enum Action: Equatable {
    case timeout
    case ban
  }

  let action: Action
  let member: EchoServerMember
  let server: EchoServerSummary
  var canDeleteRecentMessages = false
  let onCancel: () -> Void
  let onConfirmTimeout: (Int) -> Void
  let onConfirmBan: (_ durationMinutes: Int?, _ reason: String, _ deleteHours: Int) -> Void

  @State private var timeoutMinutes = 60
  @State private var timeoutUseCustom = false
  @State private var customTimeoutText = "120"

  @State private var banPermanent = true
  @State private var banMinutes = EchoModerationLimits.banPresetOneMonthMinutes
  @State private var banUseCustom = false
  @State private var customBanText = "\(EchoModerationLimits.banPresetOneMonthMinutes)"
  @State private var banReason = ""
  @State private var deleteHours = 0

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(subtitle)
            .font(.system(size: 14, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
            .listRowBackground(Color.clear)
        }

        switch action {
        case .timeout:
          timeoutSection
        case .ban:
          banSection
        }
      }
      .navigationTitle(title)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Cancel"), action: onCancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(confirmLabel, role: .destructive, action: confirm)
        }
      }
    }
    #if os(macOS)
      .frame(minWidth: 420, minHeight: 360)
    #endif
  }

  private var title: String {
    switch action {
    case .timeout: EchoCopy.string("Timeout member")
    case .ban: EchoCopy.string("Ban member")
    }
  }

  private var subtitle: String {
    switch action {
    case .timeout:
      EchoCopy.format("Disable communication for %@?", member.name)
    case .ban:
      EchoCopy.format("Ban %@ from %@?", member.name, server.name)
    }
  }

  private var confirmLabel: String {
    switch action {
    case .timeout: EchoCopy.string("Timeout")
    case .ban: EchoCopy.string("Ban")
    }
  }

  @ViewBuilder
  private var timeoutSection: some View {
    Section(EchoCopy.string("Duration")) {
      ForEach(EchoModerationLimits.timeoutPresets, id: \.minutes) { preset in
        Button {
          timeoutUseCustom = false
          timeoutMinutes = preset.minutes
        } label: {
          HStack {
            Text(EchoCopy.string(key: preset.labelKey))
            Spacer()
            if !timeoutUseCustom, timeoutMinutes == preset.minutes {
              Image(systemName: "checkmark")
                .foregroundStyle(EchoTheme.Color.indigo)
            }
          }
        }
        .buttonStyle(.plain)
      }
      Toggle(EchoCopy.string("Custom"), isOn: $timeoutUseCustom)
      if timeoutUseCustom {
        TextField(EchoCopy.string("Minutes"), text: $customTimeoutText)
          #if os(iOS)
            .keyboardType(.numberPad)
          #endif
      }
    }
  }

  @ViewBuilder
  private var banSection: some View {
    Section(EchoCopy.string("Duration")) {
      Toggle(EchoCopy.string("Permanent ban"), isOn: $banPermanent)
      if !banPermanent {
        ForEach(EchoModerationLimits.banDurationPresets, id: \.minutes) { preset in
          Button {
            banUseCustom = false
            banMinutes = preset.minutes
          } label: {
            HStack {
              Text(EchoCopy.string(key: preset.labelKey))
              Spacer()
              if !banUseCustom, banMinutes == preset.minutes {
                Image(systemName: "checkmark")
                  .foregroundStyle(EchoTheme.Color.indigo)
              }
            }
          }
          .buttonStyle(.plain)
        }
        Toggle(EchoCopy.string("Custom"), isOn: $banUseCustom)
        if banUseCustom {
          TextField(EchoCopy.string("Minutes"), text: $customBanText)
            #if os(iOS)
              .keyboardType(.numberPad)
            #endif
        }
      }
    }
    Section(EchoCopy.string("Reason (optional)")) {
      TextField(EchoCopy.string("Reason"), text: $banReason, axis: .vertical)
        .lineLimit(2...4)
    }
    if canDeleteRecentMessages {
      Section(EchoCopy.string("Delete recent messages")) {
        ForEach(EchoModerationLimits.deleteMessageHoursPresets, id: \.hours) { preset in
          Button {
            deleteHours = preset.hours
          } label: {
            HStack {
              Text(EchoCopy.string(key: preset.labelKey))
              Spacer()
              if deleteHours == preset.hours {
                Image(systemName: "checkmark")
                  .foregroundStyle(EchoTheme.Color.indigo)
              }
            }
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func confirm() {
    switch action {
    case .timeout:
      let minutes: Int
      if timeoutUseCustom, let parsed = Int(customTimeoutText.trimmingCharacters(in: .whitespaces))
      {
        minutes = EchoModerationLimits.clampTimeoutMinutes(parsed)
      } else {
        minutes = EchoModerationLimits.clampTimeoutMinutes(timeoutMinutes)
      }
      onConfirmTimeout(minutes)
    case .ban:
      let duration: Int?
      if banPermanent {
        duration = nil
      } else if banUseCustom,
        let parsed = Int(customBanText.trimmingCharacters(in: .whitespaces))
      {
        duration = EchoModerationLimits.clampBanDurationMinutes(parsed)
      } else {
        duration = EchoModerationLimits.clampBanDurationMinutes(banMinutes)
      }
      let purge =
        EchoModerationLimits.allowedPurgeHours.contains(deleteHours) ? deleteHours : 0
      onConfirmBan(duration, banReason, canDeleteRecentMessages ? purge : 0)
    }
  }
}
