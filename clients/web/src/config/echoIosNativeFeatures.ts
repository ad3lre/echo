/**
 * Build-time flags for native iOS features that depend on a Rust/Swift command
 * (and Apple-side configuration) that may not be wired in a given build.
 *
 * Flip a flag to `true` once its native command + Apple capability are in place
 * and verified on device. See docs/ios-appstore-compliance.md (#9, #10).
 */

/**
 * Sign in with Apple. Requires:
 *  - the `ios_sign_in_with_apple` Rust command (ASAuthorizationAppleIDProvider),
 *  - the `com.apple.developer.applesignin` entitlement (already added),
 *  - the "Sign In with Apple" capability on the App ID.
 */
export const ECHO_IOS_APPLE_SIGNIN_ENABLED = true;

/**
 * APNs push notifications. Requires:
 *  - the `ios_register_push_notifications` Rust command (UNUserNotificationCenter
 *    + registerForRemoteNotifications),
 *  - the `aps-environment` entitlement (already added) + remote-notification
 *    background mode (already added),
 *  - the backend device-token store + APNs dispatch (APNs .p8 key).
 */
export const ECHO_IOS_PUSH_ENABLED = true;
