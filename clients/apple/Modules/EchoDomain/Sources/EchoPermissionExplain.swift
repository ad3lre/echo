import Foundation

/// `GET /servers/:id/permission-explain` — effective permissions for one member (web `EchoPermissionExplainResponse`).
public struct EchoPermissionExplain: Decodable, Equatable, Sendable {
  public let effective: [String]
  public let ownerBypass: Bool
  public let summary: String

  public init(effective: [String], ownerBypass: Bool = false, summary: String = "") {
    self.effective = effective
    self.ownerBypass = ownerBypass
    self.summary = summary
  }

  private enum CodingKeys: String, CodingKey { case effective, ownerBypass, explanation }
  private struct Explanation: Decodable { let summary: String? }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    effective = (try? c.decodeIfPresent([String].self, forKey: .effective)) ?? []
    ownerBypass = (try? c.decodeIfPresent(Bool.self, forKey: .ownerBypass)) ?? false
    summary = (try? c.decodeIfPresent(Explanation.self, forKey: .explanation))?.summary ?? ""
  }
}
