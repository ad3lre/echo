# Database migrations — dry-run and rollback posture

Echo uses Postgres with schema evolved alongside the backend. Before production changes:

1. **Copy**: Take a snapshot or clone of production (or restore from backup to a scratch database).
2. **Apply**: Run the same migration path your deploy uses against the copy (e.g. backend boot in postgres mode applies expected schema, or run one-off scripts documented in release notes).
3. **Verify**: Smoke the app against that DB (login, read channel, send message) or run `npm run test:echo:pipeline -w backend` with `DATABASE_URL` pointed at the copy.
4. **Rollback**: Prefer **restore from backup** or redeploy the previous application image that matches the previous schema. Document which release pairs with which schema for your environment.

For snowflake-related operations, see [snowflake-cutover.md](./snowflake-cutover.md). For incidents, see [postgres-incident.md](./postgres-incident.md).
