import EchoDomain
import Foundation
import Testing

@testable import EchoFeatures

struct EchoBannerEffectsTests {
  @Test func profileDecodesBannerEffectFlags() throws {
    let json = Data(
      """
      {"id":"user-1","name":"Maya","username":"maya","avatarURL":"/maya.png","bio":"Building Echo.","bannerURL":"/banner.png","bannerColor":"#4338ca","badges":["og"],"bannerPositionY":32,"bannerRefractionEnabled":true,"bannerBlurEnabled":false,"bannerBlackoutEnabled":true}
      """.utf8)
    let profile = try JSONDecoder().decode(EchoUserProfile.self, from: json)
    #expect(profile.bannerRefractionEnabled)
    #expect(!profile.bannerBlurEnabled)
    #expect(profile.bannerBlackoutEnabled)
    #expect(profile.bannerPositionY == 32)
  }

  @Test func profileDefaultsMissingEffectFlagsToOff() throws {
    let json = Data(
      """
      {"id":"user-1","name":"Maya"}
      """.utf8)
    let profile = try JSONDecoder().decode(EchoUserProfile.self, from: json)
    #expect(!profile.bannerRefractionEnabled)
    #expect(!profile.bannerBlurEnabled)
    #expect(!profile.bannerBlackoutEnabled)
  }

  @Test func withBannerEffectsCopiesFlags() {
    let base = EchoUserProfile(id: "1", name: "A", bannerRefractionEnabled: true)
    let next = base.withBannerEffects(blur: true, blackout: true)
    #expect(next.bannerRefractionEnabled)
    #expect(next.bannerBlurEnabled)
    #expect(next.bannerBlackoutEnabled)
    #expect(base.bannerBlurEnabled == false)
  }

  @Test func effectStyleTokensMatchWeb() {
    #expect(EchoBannerEffectStyle.refractionOpacity == 0.24)
    #expect(EchoBannerEffectStyle.refractionBlur == 28)
    #expect(EchoBannerEffectStyle.bannerBlur == 8)
    #expect(EchoBannerEffectStyle.blackoutOpacity == 0.55)
  }
}
