import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { type FastifyInstance } from 'fastify';

/**
 * Strict rate limiting for authentication endpoints
 * 5 attempts per 1 minute to prevent brute force attacks
 */
export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    max: 5,
    timeWindow: '1 minute',
    cache: 10000,
    allowList: process.env.NODE_ENV === 'development' ? ['127.0.0.1'] : [],
    skipOnError: false,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (request, context) => {
      return {
        error: 'Too many attempts',
        message: 'Too many login attempts. Please try again in 1 minute.',
        statusCode: 429,
        retryAfter: context.after,
      };
    },
  });
});
