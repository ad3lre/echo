/**
 * Standard API error response format.
 * Backend should return this shape for error responses.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  /**
   * Optional machine-readable token for clients and support (e.g. validation, upstream errors,
   * Echo permission denials such as `MISSING_VIEW_CHANNEL`, `NOT_SERVER_MEMBER`, `MISSING_CONNECT`).
   */
  detail?: string;
  /** Join gate: set with `APPLICATION_REQUIRED` so the client can open the application modal. */
  serverId?: string;
  source?: 'invite' | 'directory';
}
