import AVFoundation
import Foundation

#if os(macOS)
  import CoreAudio
#endif

struct EchoAVDevice: Equatable {
  let id: String
  let name: String
}

/// Real AV devices for the Voice & Video pickers (replaces the hard-coded two options).
enum EchoAVDeviceCatalog {
  enum Kind { case audioInput, audioOutput, camera }

  static let defaultID = "default"
  /// iOS output routes (the system picker owns Bluetooth / AirPlay).
  static let speakerID = "built-in-speaker"
  static let receiverID = "receiver"
  static let builtInMicID = "built-in-mic"

  /// Concrete devices only — no "System default" row.
  static func devices(_ kind: Kind) -> [EchoAVDevice] {
    switch kind {
    case .camera: return cameras()
    case .audioInput: return audioInputs()
    case .audioOutput: return audioOutputs()
    }
  }

  /// `(value, label)` rows for `EchoSettingChoice`; keeps an unplugged selection visible.
  static func options(_ kind: Kind, selected: String) -> [(String, String)] {
    var rows: [(String, String)] = [(defaultID, EchoCopy.string("System default"))]
    let found = devices(kind)
    rows += found.map { ($0.id, $0.name) }
    if selected != defaultID, !found.contains(where: { $0.id == selected }) {
      rows.append((selected, EchoCopy.string("Unavailable device")))
    }
    return rows
  }

  // MARK: Cameras

  private static func cameras() -> [EchoAVDevice] {
    var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera]
    #if os(iOS)
      types += [.builtInUltraWideCamera, .builtInTelephotoCamera]
    #endif
    types.append(.external)
    types.append(.continuityCamera)
    return AVCaptureDevice.DiscoverySession(
      deviceTypes: types, mediaType: .video, position: .unspecified
    ).devices.map { EchoAVDevice(id: $0.uniqueID, name: $0.localizedName) }
  }

  // MARK: Audio

  private static func audioInputs() -> [EchoAVDevice] {
    #if os(iOS)
      let inputs = AVAudioSession.sharedInstance().availableInputs ?? []
      return inputs.map {
        EchoAVDevice(id: $0.portType == .builtInMic ? builtInMicID : $0.uid, name: $0.portName)
      }
    #else
      return coreAudioDevices(output: false)
    #endif
  }

  private static func audioOutputs() -> [EchoAVDevice] {
    #if os(iOS)
      return [
        EchoAVDevice(id: speakerID, name: EchoCopy.string("Speaker")),
        EchoAVDevice(id: receiverID, name: EchoCopy.string("Phone earpiece")),
      ]
    #else
      return coreAudioDevices(output: true)
    #endif
  }

  #if os(macOS)
    private static func coreAudioDevices(output: Bool) -> [EchoAVDevice] {
      var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
      var size: UInt32 = 0
      let system = AudioObjectID(kAudioObjectSystemObject)
      guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else {
        return []
      }
      var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
      guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else {
        return []
      }
      let scope = output ? kAudioObjectPropertyScopeOutput : kAudioObjectPropertyScopeInput
      return ids.compactMap { id in
        guard channelCount(id, scope: scope) > 0,
          let uid = stringProperty(id, selector: kAudioDevicePropertyDeviceUID),
          let name = stringProperty(id, selector: kAudioObjectPropertyName)
        else { return nil }
        return EchoAVDevice(id: uid, name: name)
      }
    }

    private static func channelCount(_ id: AudioDeviceID, scope: AudioObjectPropertyScope) -> Int {
      var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreamConfiguration, mScope: scope,
        mElement: kAudioObjectPropertyElementMain)
      var size: UInt32 = 0
      guard AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr, size > 0
      else { return 0 }
      let raw = UnsafeMutableRawPointer.allocate(
        byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
      defer { raw.deallocate() }
      guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, raw) == noErr else { return 0 }
      let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
      return list.reduce(0) { $0 + Int($1.mNumberChannels) }
    }

    private static func stringProperty(_ id: AudioObjectID, selector: AudioObjectPropertySelector)
      -> String?
    {
      var address = AudioObjectPropertyAddress(
        mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
      var value: Unmanaged<CFString>?
      var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
      guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr,
        let value
      else { return nil }
      return value.takeRetainedValue() as String
    }
  #endif
}
