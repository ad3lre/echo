import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
final class EchoE2eeDevicesModel {
  private(set) var devices: [EchoE2eeDevice] = []
  private(set) var isLoading = false
  private(set) var revokingID: String?
  var errorMessage: String?

  @ObservationIgnored private let client: any EchoE2eeDevicesServing
  @ObservationIgnored private let accessToken: String

  init(client: any EchoE2eeDevicesServing, accessToken: String) {
    self.client = client
    self.accessToken = accessToken
  }

  func refresh() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      devices = try await client.loadDevices(accessToken: accessToken)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func revoke(_ device: EchoE2eeDevice) async {
    guard !device.isRevoked, revokingID == nil else { return }
    revokingID = device.deviceID
    errorMessage = nil
    defer { revokingID = nil }
    do {
      try await client.revokeDevice(device.deviceID, accessToken: accessToken)
      await refresh()
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

/// Settings → Encryption devices (web `E2eeDevicesModal.vue`): list registered
/// E2EE devices and revoke them. QR pairing and the local safety number rely on
/// the web key store and are not part of the native page.
struct EchoE2eeDevicesView: View {
  @State private var model: EchoE2eeDevicesModel
  @State private var deviceToRevoke: EchoE2eeDevice?

  init(accessToken: String, baseURL: URL) {
    _model = State(
      initialValue: EchoE2eeDevicesModel(
        client: EchoE2eeDevicesClient(baseURL: baseURL), accessToken: accessToken))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: EchoCopy.string("Encryption devices")) {
        EchoCopy.text(
          "New devices must be explicitly approved. Revoking a device removes its ability to receive future encrypted messages from this account."
        )
        .font(.footnote).foregroundStyle(.secondary)
        if let message = model.errorMessage {
          Text(message).font(.footnote).foregroundStyle(.red)
        }
        if model.isLoading && model.devices.isEmpty {
          ProgressView().frame(maxWidth: .infinity)
        } else if model.devices.isEmpty {
          EchoCopy.text("No devices registered yet.")
            .font(.system(size: 14)).foregroundStyle(.secondary)
        } else {
          ForEach(model.devices) { device in
            deviceRow(device)
          }
        }
        Button {
          Task { await model.refresh() }
        } label: {
          EchoCopy.text("Refresh").font(.system(size: 13, weight: .semibold))
        }
        .buttonStyle(.bordered)
        .disabled(model.isLoading)
      }
    }
    .task { await model.refresh() }
    .confirmationDialog(
      EchoCopy.string("Revoke this device?"),
      isPresented: Binding(
        get: { deviceToRevoke != nil }, set: { if !$0 { deviceToRevoke = nil } }),
      titleVisibility: .visible
    ) {
      Button(EchoCopy.string("Revoke"), role: .destructive) {
        if let device = deviceToRevoke { Task { await model.revoke(device) } }
        deviceToRevoke = nil
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) { deviceToRevoke = nil }
    } message: {
      EchoCopy.text("It will lose access to future encrypted messages.")
    }
  }

  private func deviceRow(_ device: EchoE2eeDevice) -> some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 3) {
        Text(device.deviceID)
          .font(.system(size: 12, design: .monospaced))
          .foregroundStyle(EchoTheme.Color.ink(device.isRevoked ? 0.4 : 0.8))
          .lineLimit(1).truncationMode(.middle)
        Text(meta(device))
          .font(.system(size: 12)).foregroundStyle(.secondary)
      }
      Spacer(minLength: 8)
      Button(role: .destructive) {
        deviceToRevoke = device
      } label: {
        EchoCopy.text("Revoke").font(.system(size: 13, weight: .semibold))
      }
      .buttonStyle(.bordered)
      .disabled(device.isRevoked || model.revokingID != nil)
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .combine)
  }

  private func meta(_ device: EchoE2eeDevice) -> String {
    var text = EchoCopy.format("Protocol device #%lld", Int64(device.protocolDeviceID))
    if let added = device.createdAt {
      text += " · " + EchoCopy.format("Added %@", Self.formatter.string(from: added))
    }
    if let revoked = device.revokedAt {
      text += " · " + EchoCopy.format("Revoked %@", Self.formatter.string(from: revoked))
    }
    return text
  }

  private static var formatter: DateFormatter {
    let f = DateFormatter()
    f.locale = EchoAppLocale.preferredLocale
    f.dateStyle = .medium
    f.timeStyle = .short
    return f
  }
}
