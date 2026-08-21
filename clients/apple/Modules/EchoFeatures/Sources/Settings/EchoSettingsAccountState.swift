import EchoNetworking

/// Account-owned settings loaded from the server for the active session.
///
/// Keeping these values together prevents device-global persistence from
/// leaking one account's preferences into another account's settings screen.
struct EchoSettingsAccountState: Equatable {
  var username = ""
  var email = ""
  var phone = ""
  var emailVerified = false
  var phoneVerified = false
  var totpEnabled = false
  var friendsAllowed = true
  var messagesAllowed = true
  var showLastOnline = true
  var discoverability = false
  var analytics = true
  var personalizedTips = true
  var readReceipts = false

  mutating func apply(_ identity: EchoAccountIdentity) {
    username = identity.username ?? ""
    email = identity.email ?? ""
    phone = identity.phone ?? identity.pendingPhone ?? ""
    emailVerified = identity.emailVerified == true
    phoneVerified = identity.phoneVerified == true
    totpEnabled = identity.totpEnabled == true
    if let value = identity.allowFriendRequests { friendsAllowed = value }
    if let value = identity.allowMessageRequests { messagesAllowed = value }
    if let value = identity.showLastOnline { showLastOnline = value }
    if let value = identity.discoverability { discoverability = value }
    if let value = identity.analytics { analytics = value }
    if let value = identity.personalizedTips { personalizedTips = value }
    if let value = identity.readReceipts { readReceipts = value }
  }
}
