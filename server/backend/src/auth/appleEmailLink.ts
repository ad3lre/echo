/**
 * Apple sign-in may attach to an existing password account by email only when
 * BOTH Apple asserts the email is verified AND the local account's email is
 * verified. Otherwise an attacker could pre-register a victim's email (or use
 * an unverified Apple claim) to hijack/pre-hijack the account.
 */
export function mayLinkAppleByEmail(
  emailVerifiedFromIdp: boolean,
  localUser: { emailVerified: boolean },
): boolean {
  return emailVerifiedFromIdp === true && localUser.emailVerified === true;
}
