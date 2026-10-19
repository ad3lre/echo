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

  @Test func localeOptionsIncludeSpanishBrazilianPortugueseAndGerman() {
    #expect(EchoLocaleOptions.languages.contains(where: { $0.0 == "de" && $0.1 == "Deutsch" }))
    #expect(EchoLocaleOptions.languages.contains(where: { $0.0 == "es" }))
    #expect(
      EchoLocaleOptions.languages.contains(where: {
        $0.0 == "pt-BR" && $0.1 == "Português (Brasil)"
      }))
    for (identifier, _) in EchoLocaleOptions.languages {
      #expect(EchoAppLocale.supportedIdentifiers.contains(identifier))
    }
  }

  @Test func appLocaleMapsStoredIdentifiersToSwiftUILocales() {
    #expect(EchoAppLocale.storageKey == "echo.settings.locale")
    #expect(EchoAppLocale.supportedIdentifiers == ["en-US", "en-GB", "es", "pt-BR", "de"])
    #expect(EchoAppLocale.swiftUILocale(from: "en-GB").identifier == "en-GB")
    #expect(EchoAppLocale.swiftUILocale(from: "es").language.languageCode?.identifier == "es")
    let pt = EchoAppLocale.swiftUILocale(from: "pt-BR")
    #expect(pt.language.languageCode?.identifier == "pt")
    #expect(pt.region?.identifier == "BR")
    #expect(EchoAppLocale.swiftUILocale(from: "de").language.languageCode?.identifier == "de")
    #expect(EchoAppLocale.swiftUILocale(from: "xx").identifier == "en-US")
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
