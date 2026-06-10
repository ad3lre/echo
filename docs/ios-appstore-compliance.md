# iOS App Store compliance

Status of the 12 App Store readiness items for the Tauri iOS build (`Echo`,
bundle id `com.echo.ios`). Items 1–12 have their in-repo implementation complete;
items 9–10 still need Apple-portal credentials and on-device verification before
submission.

| #   | Item                                           | Status                                                                  |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Production bundle id `com.echo.ios`            | ✅ Done — `tauri.ios.conf.json`, `gen/apple/project.yml`                |
| 2   | Privacy manifest                               | ✅ Done — `gen/apple/PrivacyInfo.xcprivacy` (bundled via `project.yml`) |
| 3   | Remove dev-only networking from shipping plist | ✅ Done — `Info.ios.plist`                                              |
| 4   | Gate third-party game embeds on iOS            | ✅ Done — `VcActivityStage.vue` + iOS CSP `frame-src`                   |
| 5   | Min deployment target → iOS 15.0               | ✅ Done — `project.yml`                                                 |
| 6   | Background-audio justification                 | ✅ Kept + documented (below)                                            |
| 7   | Age-rating answers                             | 📋 Guidance below (App Store Connect step)                              |
| 8   | Account deletion for password-less accounts    | ✅ Done — backend + frontend                                            |
| 9   | Sign in with Apple                             | ✅ Code done; Apple portal + on-device verify (below)                   |
| 10  | APNs push                                      | ✅ Code done; APNs `.p8` key + on-device verify (below)                 |
| 11  | iPad universal support                         | ✅ Config done; layout verification required (below)                    |
| 12  | Encryption export compliance                   | ✅ Declared; legal confirmation required (below)                        |

---

## 6 — Background audio

`UIBackgroundModes` includes `audio`, which is **justified**: Echo keeps the
LiveKit voice/video audio session alive while backgrounded so a call continues
when the user leaves the app. App Review (2.5.4) only rejects this when the app
does not actually play audio in the background.

**To verify before submission:** on a real device, join a voice channel,
background the app, and confirm audio continues. The web audio session must hold
an `AVAudioSession` category of `playback`/`playAndRecord`; if backgrounded audio
drops, set the category natively at startup.

**Incoming calls:** waking the app for an _incoming_ call while fully suspended
needs **VoIP push (PushKit) + CallKit**, not bare background-audio. That is a
larger feature; the current background-audio mode covers staying in an
already-joined call.

## 7 — Age rating (App Store Connect)

With the third-party web games gated off on iOS (#4), Echo is a UGC chat/voice
app. Suggested answers to Apple's age-rating questionnaire:

- **User-generated content:** Yes → Echo has chat, DMs, and voice. This alone
  sets a 17+/“Unrestricted” floor unless paired with the moderation controls
  Echo already ships (report, block, filtering, contact info — Guideline 1.2).
- **Unrestricted web access:** No (the open-web game embeds are disabled on iOS;
  remaining embeds are youtube-nocookie). Answer Yes only if you re-enable any
  arbitrary in-app web browsing.
- **Medical/gambling/contests:** No.
- Answer honestly; mismatches with actual behaviour are a metadata-rejection risk
  (Guideline 2.3.6). Provide a **demo account** (guest mode works) in App Review
  notes.

## 9 — Sign in with Apple

Implemented in-repo:

- Entitlement `com.apple.developer.applesignin` → `Entitlements.ios.plist`.
- Native `ASAuthorizationController` coordinator in
  `gen/apple/Sources/echo-desktop/EchoNativeIosFeatures.swift`, exposed to the
  WebView via Rust commands `ios_sign_in_with_apple` / `ios_register_push_notifications`
  (`src-tauri/src/ios_features.rs`).
- Backend identity-token verifier `backend/src/services/integrations/appleOidc.ts`.
- Backend route `POST /api/v1/auth/apple/login` with `auth_apple_user_links`
  keyed by Apple `sub`.
- Frontend client `authSignInWithApple()` + native helper
  `frontend/src/platform/iosAppleSignIn.ts` + login chip in
  `MobileAuthExperience.vue` (`ECHO_IOS_APPLE_SIGNIN_ENABLED = true`).

**Before submission (Apple portal + device):**

1. Enable “Sign In with Apple” on the `com.echo.ios` App ID in Apple Developer.
2. On a physical device: tap “Continue with Apple”, confirm session restore
   (cookie + native bearer) and that returning users with a rotated private-relay
   email still land on the same account (`auth_apple_user_links`).

## 10 — APNs push

Implemented in-repo:

- Entitlement `aps-environment` and `remote-notification` background mode.
- Native registration in `EchoNativeIosFeatures.swift` (permission +
  `registerForRemoteNotifications` + delegate proxy for the device token).
- `auth_ios_device_tokens` table + `POST /api/v1/auth/push/register` and
  `/unregister` (`backend/src/api/routes/auth/push.ts`).
- APNs HTTP/2 dispatcher `backend/src/services/echoApns.ts`, wired into DM /
  mention push fan-out alongside web push (`echoMessagePushNotify.ts`).
- Frontend `registerIosPushNotifications()` + `syncIosPushAfterAuth()` after
  login (`ECHO_IOS_PUSH_ENABLED = true`).

**Before submission (Apple portal + backend env + device):**

1. Enable “Push Notifications” on the App ID; create an APNs Auth Key (`.p8`).
2. Set backend env: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` (PEM contents,
   newlines as `\n` or literal), `APNS_BUNDLE_ID=com.echo.ios`,
   `APNS_ENVIRONMENT=sandbox` (dev) or `production` (App Store build). Remap
   `aps-environment` in entitlements to `production` for release builds.
3. On a physical device (not Simulator): log in, confirm
   `POST /auth/push/register` succeeds and a mention/DM push arrives when the
   app is backgrounded.

## 11 — iPad universal support

`TARGETED_DEVICE_FAMILY = '1,2'` (iPhone + iPad) is set explicitly in
`project.yml`, and the Info.plist declares iPad orientations. Because the app
**advertises** iPad support, the responsive layout must work unscaled on iPad
sizes or App Review can reject under 4.2/2.1.

**Before submission:** run on an iPad simulator (e.g. iPad Pro 11") and verify the
chat/voice/settings layouts. If iPad is not ready, switch to iPhone-only
(`TARGETED_DEVICE_FAMILY = '1'`) and drop the `~ipad` orientations.

## 12 — Encryption export compliance

`ITSAppUsesNonExemptEncryption = false` is declared in `Info.ios.plist`. Echo
uses only standard, publicly-available encryption (HTTPS/TLS in transit, standard
primitives for E2EE DMs), which generally qualifies for the mass-market
exemption.

**Confirm with legal before first submission.** Shipping E2EE can require either
explicitly claiming the exemption in App Store Connect or filing the annual
self-classification report. If your counsel says the exemption does not cleanly
apply, set `ITSAppUsesNonExemptEncryption = true` and complete the export-
compliance questionnaire instead.

---

## Pre-submission checklist (App Store Connect / portal)

- [ ] Register `com.echo.ios` App ID; enable Sign In with Apple + Push Notifications.
- [ ] Create APNs `.p8` key (Key ID + Team ID); set `APNS_*` env on the backend.
- [ ] App Privacy “nutrition labels” match `PrivacyInfo.xcprivacy` and backend data practices.
- [ ] Age rating questionnaire answered (see #7); demo/guest account in review notes.
- [ ] Confirm encryption export answer with legal (#12).
- [ ] Verify on real iPhone + iPad: voice in background (#6), camera/mic capture, iPad layout (#11).
- [ ] Verify Sign in with Apple + APNs on a physical iPhone (#9, #10).
- [ ] Bump `CFBundleVersion` per upload.
