import CryptoKit
import Foundation

/// Byte-compatible with `mlsExporter` in `server/backend/crypto/src/mls/mlsCrypto.ts`
/// (ts-mls HKDF-SHA256 ExpandWithLabel). Used once an MLS group yields an
/// exporter secret — OpenMLS / ts-mls group membership still owns that secret.
enum EchoMlsMediaKey {
  static let mediaKeyBytes = 16
  static let sharedLabel = "echo-voice-sframe"
  static let sharedContext = Data("echo-voice/v2".utf8)
  static let senderLabel = "echo-voice-sframe-sender"

  static func deriveShared(exporterSecret: Data) throws -> Data {
    try mlsExporter(
      exporterSecret: exporterSecret,
      label: sharedLabel,
      context: sharedContext,
      length: mediaKeyBytes)
  }

  static func deriveSender(exporterSecret: Data, senderUserID: String) throws -> Data {
    let context = Data(
      "sender:\(senderUserID.trimmingCharacters(in: .whitespacesAndNewlines))".utf8)
    return try mlsExporter(
      exporterSecret: exporterSecret,
      label: senderLabel,
      context: context,
      length: mediaKeyBytes)
  }

  /// RFC 9420 `MLS-Exporter(Secret, Label, Context, length)` via ts-mls.
  static func mlsExporter(
    exporterSecret: Data,
    label: String,
    context: Data,
    length: Int
  ) throws -> Data {
    let secret = try deriveSecret(secret: exporterSecret, label: label)
    let hashedContext = Data(SHA256.hash(data: context))
    return try expandWithLabel(
      secret: secret,
      label: "exported",
      context: hashedContext,
      length: length)
  }

  static func deriveSecret(secret: Data, label: String) throws -> Data {
    try expandWithLabel(secret: secret, label: label, context: Data(), length: 32)
  }

  static func expandWithLabel(
    secret: Data,
    label: String,
    context: Data,
    length: Int
  ) throws -> Data {
    var info = Data()
    info.append(contentsOf: UInt16(length).bigEndianBytes)
    info.append(tlsOpaque(Data("MLS 1.0 \(label)".utf8)))
    info.append(tlsOpaque(context))
    return try hkdfExpand(prk: secret, info: info, length: length)
  }

  /// RFC 5869 HKDF-Expand with HMAC-SHA256.
  static func hkdfExpand(prk: Data, info: Data, length: Int) throws -> Data {
    guard length > 0, length <= 255 * 32 else {
      throw EchoCallTransportError.encryptedMediaUnavailable
    }
    let key = SymmetricKey(data: prk)
    var okm = Data()
    var previous = Data()
    var counter: UInt8 = 1
    while okm.count < length {
      var block = Data()
      block.append(previous)
      block.append(info)
      block.append(counter)
      let mac = HMAC<SHA256>.authenticationCode(for: block, using: key)
      previous = Data(mac)
      okm.append(previous)
      counter &+= 1
    }
    return okm.prefix(length)
  }

  /// TLS 1.3 variable-length opaque vector (MLS / ts-mls `varLenDataEncoder`).
  static func tlsOpaque(_ data: Data) -> Data {
    var out = Data()
    let len = data.count
    if len < 64 {
      out.append(UInt8(len & 0b0011_1111))
    } else if len < 16_384 {
      out.append(UInt8(((len >> 8) & 0b0011_1111) | 0b0100_0000))
      out.append(UInt8(len & 0xff))
    } else {
      out.append(UInt8(((len >> 24) & 0b0011_1111) | 0b1000_0000))
      out.append(UInt8((len >> 16) & 0xff))
      out.append(UInt8((len >> 8) & 0xff))
      out.append(UInt8(len & 0xff))
    }
    out.append(data)
    return out
  }
}

extension UInt16 {
  fileprivate var bigEndianBytes: [UInt8] {
    [UInt8(self >> 8), UInt8(self & 0xff)]
  }
}
