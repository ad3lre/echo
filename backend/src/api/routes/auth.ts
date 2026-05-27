import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import registerRoutes from './auth/register';
import loginRoutes from './auth/login';
import passwordRoutes from './auth/password';
import twoFactorRoutes from './auth/2fa';
import sessionRoutes from './auth/session';
import guestRoutes from './auth/guest';
import meRoutes from './auth/me';
import echoPlusInterestRoutes from './auth/echoPlusInterest';
import desktopHandoffRoutes from './auth/desktop-handoff';

/**
 * Authentication routes split by domain for maintainability.
 */
export default async function authRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(registerRoutes);
  await fastify.register(loginRoutes);
  await fastify.register(passwordRoutes);
  await fastify.register(twoFactorRoutes);
  await fastify.register(sessionRoutes);
  await fastify.register(guestRoutes);
  await fastify.register(desktopHandoffRoutes);
  await fastify.register(meRoutes);
  await fastify.register(echoPlusInterestRoutes);
}
