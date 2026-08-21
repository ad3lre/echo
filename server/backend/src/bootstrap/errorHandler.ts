import type { FastifyError, FastifyInstance } from 'fastify';
import { sendError } from '../api/errors';
import { isPgUnavailableError } from '../db/pgErrors';

/**
 * Sanitize uncaught route errors so production clients never receive raw database
 * exception text (SQLSTATE codes, operator names, etc.).
 */
export function registerGlobalErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((err: FastifyError, req, reply) => {
    if (reply.sent) return;

    const statusCode =
      typeof err.statusCode === 'number' && err.statusCode >= 400
        ? err.statusCode
        : 500;

    if (err.validation) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid request');
    }

    if (isPgUnavailableError(err)) {
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    }

    if (statusCode < 500) {
      const message =
        typeof err.message === 'string' && err.message.trim()
          ? err.message
          : 'Bad Request';
      return sendError(reply, statusCode, 'REQUEST_ERROR', message);
    }

    req.log.error(err, 'Unhandled route error');
    return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
  });
}
