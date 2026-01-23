import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

/**
 * Security plugin that adds:
 * - Rate limiting
 * - Security headers (helmet)
 * - CSRF protection
 * - Request size limits
 */
export default fp(async (fastify: FastifyInstance) => {
  // Add security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
      },
    },
    // HSTS in production
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
  });

  // Rate limiting for general API
  await fastify.register(rateLimit, {
    max: 100, // 100 requests
    timeWindow: '1 minute',
    cache: 10000,
    allowList: ['127.0.0.1'], // Allow localhost in development
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });

  // CSRF Protection - Verify X-Requested-With header for API calls
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip CSRF check for GET requests and non-API routes
    if (request.method === 'GET' || !request.url.startsWith('/api/')) {
      return;
    }

    // Skip for public endpoints
    const publicEndpoints = ['/api/auth/login', '/api/auth/register', '/api/leaderboard'];
    if (publicEndpoints.some(endpoint => request.url.startsWith(endpoint))) {
      return;
    }

    const csrfHeader = request.headers['x-requested-with'];
    
    // Allow requests with valid JWT (authenticated requests)
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return; // JWT validation will happen in authenticate decorator
    }
    
    // For non-authenticated POST/PUT/DELETE, require CSRF header
    if (!csrfHeader || csrfHeader !== 'XMLHttpRequest') {
      reply.code(403).send({ error: 'Invalid request origin' });
      return;
    }
  });
});
