import Foundation

struct EchoSettingsPresenceResponse: Decodable {
  let presence: [String: String]
}

struct NotificationResponse: Decodable { let settings: EchoNotificationPreferences? }
struct NotificationPayload: Encodable { let settings: EchoNotificationPreferences }
struct FriendsResponse: Decodable { let friends: [EchoFriendSummary] }
struct CandidatesResponse: Decodable { let users: [EchoFriendCandidate] }
struct SessionsResponse: Decodable { let sessions: [EchoAuthSession] }
struct PasskeysResponse: Decodable { let passkeys: [EchoPasskeyCredential] }
struct AccountResponse: Decodable { let user: EchoAccountIdentity }
struct SettingsErrorPayload: Decodable {
  let code: String?
  let message: String?
  let detail: String?
}
