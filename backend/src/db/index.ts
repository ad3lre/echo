/**
 * Database layer exports.
 * - pg: PostgreSQL client (when ECHO_BACKEND_STORAGE=postgres, requires DATABASE_URL)
 * - nats: NATS connection (when NATS_URL set)
 */

export { getPgPool, closePgPool } from './pg';
export { getNatsConnection, connectNats, disconnectNats } from './nats';
