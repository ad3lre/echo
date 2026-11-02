import EchoDomain
import Foundation

extension EchoCallModel {
  /// 1:1 DM calls expose the peer's volume (group DMs have no single peer to adjust).
  var remoteVolumePeerID: String? {
    guard let peer = conversation?.peerUserID, !peer.isEmpty,
      conversation?.memberUserIDs.count ?? 0 <= 2
    else { return nil }
    return peer
  }

  func remoteVolume(for userID: String) -> Int {
    EchoRemoteVolume.load()[userID] ?? 100
  }

  func setRemoteVolume(_ percent: Double, for userID: String) {
    (transport as? EchoCallVolumeTransporting)?.setRemoteVolume(identity: userID, percent: percent)
  }

  /// Context-menu / popover handle for `echoRemoteVolumeControl(volume:)`.
  var remoteVolumeBinding: EchoRemoteVolumeBinding? {
    guard let peer = remoteVolumePeerID, transport is EchoCallVolumeTransporting else { return nil }
    return EchoRemoteVolumeBinding(
      percent: { [weak self] in self?.remoteVolume(for: peer) ?? 100 },
      set: { [weak self] in self?.setRemoteVolume($0, for: peer) })
  }
}
