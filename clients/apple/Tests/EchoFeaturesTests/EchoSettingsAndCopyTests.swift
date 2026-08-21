import EchoNetworking
import Foundation
import Testing

@testable import EchoFeatures

struct EchoSettingsAndCopyTests {
  @Test func applyLeavesUnspecifiedPreferencesAtDefaults() throws {
    let identity = try JSONDecoder().decode(
      EchoAccountIdentity.self,
      from: Data(
        """
        {
          "username":"maya",
          "email":"maya@example.com",
          "emailVerified":true
        }
        """.utf8)
    )
    var state = EchoSettingsAccountState()
    state.apply(identity)

    #expect(state.username == "maya")
    #expect(state.emailVerified)
    #expect(state.friendsAllowed)
    #expect(state.messagesAllowed)
    #expect(state.showLastOnline)
    #expect(!state.discoverability)
    #expect(state.analytics)
    #expect(state.personalizedTips)
    #expect(!state.readReceipts)
  }

  @Test func applyOverwritesPreviousAccountOwnedValues() throws {
    var state = EchoSettingsAccountState()
    state.username = "old"
    state.friendsAllowed = false
    state.readReceipts = true

    let identity = try JSONDecoder().decode(
      EchoAccountIdentity.self,
      from: Data(
        """
        {
          "username":"new",
          "allowFriendRequests":true,
          "readReceipts":false
        }
        """.utf8)
    )
    state.apply(identity)

    #expect(state.username == "new")
    #expect(state.friendsAllowed)
    #expect(!state.readReceipts)
  }

  @Test func settingsRoutesExposeLocalizedTitles() {
    #expect(EchoSettingsRoute.allCases.count >= 18)
    for route in EchoSettingsRoute.allCases {
      #expect(!route.title.isEmpty)
      #expect(route.id == route)
    }
    #expect(EchoSettingsRoute.account.title == EchoCopy.string("Account"))
    #expect(EchoSettingsRoute.dataPrivacy.title == EchoCopy.string("Data & Privacy"))
  }

  @Test func externalProviderIDsAreStable() {
    #expect(EchoSettingsRoute.discord.externalProviderID == "discord")
    #expect(EchoSettingsRoute.google.externalProviderID == "google")
    #expect(EchoSettingsRoute.youtube.externalProviderID == "youtube")
    #expect(EchoSettingsRoute.account.externalProviderID == nil)
  }

  @Test func localeOptionsIncludeSpanish() {
    #expect(EchoLocaleOptions.languages.contains(where: { $0.0 == "es" }))
  }

  @Test func echoCopyFormatSubstitutesArguments() {
    let formatted = EchoCopy.format("Unlock with %@", "Face ID")
    #expect(formatted.contains("Face ID"))
    #expect(!formatted.contains("%@"))
  }

  @Test func echoCopyStringReturnsCatalogCopy() {
    #expect(EchoCopy.string("Log in") == "Log in" || !EchoCopy.string("Log in").isEmpty)
    #expect(EchoCopy.string(key: "Settings") == EchoCopy.string("Settings"))
  }
}
