# Discord Imported Server Account Parity Decisions

## Goal

Imported Discord servers need one authority for Discord-derived truth without trampling native Echo state.

The model decision is:

- Echo user identity is canonical once a Discord account is linked.
- Discord-imported role grants and member-specific imported overwrites are Discord-owned state.
- Native Echo memberships, native Echo roles, and native Echo per-member changes remain Echo-owned state.

## Canonical identity rules

- A linked Discord account always resolves to one canonical Echo user through `auth_discord_user_links`.
- Shadow users only exist as temporary placeholders for imported Discord members who have not linked yet.
- When a user links later, all imported shadow state moves onto the canonical Echo user and the shadow user is deleted.

## Role authority rules

- Imported Discord role grants are tracked by `server_id + discord_user_id`, not by the temporary Echo/shadow user id.
- Re-importing members reconciles only the Discord-managed role set for that Discord member.
- Re-importing members must never delete unrelated native Echo role assignments from the resolved Echo user.
- Linking later must apply the stored Discord-managed role set onto the canonical Echo user.
- If the canonical Echo user was already in the imported server, the result is:
  - keep native Echo roles
  - add the imported Discord-managed roles
  - remove the same imported roles from the old shadow user

## Role name collision rules

- Imported Discord roles must not claim existing Echo roles by name.
- `@everyone` is the only role that intentionally maps onto an existing Echo role.
- For every other Discord role:
  - if the exact name is free, keep it
  - if the name collides with an existing Echo role, create a distinct imported role name using the ` (Discord Imported)` suffix
  - if that suffix also collides, append an incrementing number

This prevents imported Discord truth from mutating native Echo role definitions.

## Member overwrite rules

- Imported member-specific permission overwrites are part of Discord parity and must follow the Discord identity.
- When a shadow user is merged into a canonical Echo user, shadow-targeted member overwrite rows move to the canonical user.
- If the canonical user already has a member overwrite on the same imported channel/category, the imported Discord-targeted row wins for that scope.

## Conflict outcomes

### User already exists in Echo server, then links Discord later

- Membership stays on the existing Echo user.
- Native Echo roles stay.
- Stored Discord-imported roles are added.
- Imported member-specific overwrites follow onto the linked Echo user.
- The shadow user is removed.

### User linked before member import runs

- Member import resolves directly to the canonical Echo user.
- Import applies Discord-managed roles without deleting native Echo roles.

### Imported Discord role has same name as native Echo role

- Native Echo role stays untouched.
- Import creates a separate imported role with a collision-safe name.

## Why this model

- Truth stays in the model/domain layer instead of the client.
- Discord parity has one authority.
- Echo-native customization keeps one authority.
- Linking order no longer changes the resulting permissions.
