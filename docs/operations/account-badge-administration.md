# Official account badge administration

Official awards are administrative data identified by immutable `auth_users.id`.
Schema initialization never grants awards from usernames. Existing awards remain
stored so legitimate awards survive account renames and process restarts.

## Audit previously issued awards

Run this read-only query against the deployment being audited:

```sql
SELECT id, username, created_at, awarded_badges
FROM auth_users
WHERE awarded_badges && ARRAY['developer', 'bug_hunter', 'og']::text[]
ORDER BY id;
```

Verify each account ID and award against the operator's trusted award records.
Current usernames cannot establish who originally earned an award. Record the
verified IDs, approved awards and any revoked awards in the deployment audit.

## Grant or revoke a verified award

An authorized database operator can use these psql commands after substituting
the verified account ID and approved badge. The scripts preserve other badges.

```sql
\set user_id 'verified-account-id'
\set badge 'developer'

-- Grant the approved award once.
UPDATE auth_users
SET awarded_badges = array_append(awarded_badges, :'badge')
WHERE id = :'user_id'
  AND :'badge' IN ('developer', 'bug_hunter', 'og')
  AND NOT (:'badge' = ANY(awarded_badges))
RETURNING id, awarded_badges;

```

To revoke a specific unapproved award, set the verified account ID and badge,
then execute this statement instead:

```sql
UPDATE auth_users
SET awarded_badges = array_remove(awarded_badges, :'badge')
WHERE id = :'user_id'
  AND :'badge' IN ('developer', 'bug_hunter', 'og')
RETURNING id, awarded_badges;
```

Execute only the chosen grant or revoke statement. A zero-row result requires
checking the account ID and current awards before taking further action.
