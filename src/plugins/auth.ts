import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import crypto from "crypto";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            sub: string;
            email: string;
            admin: boolean;
            tournamentOrganizer: boolean;
            blogger: boolean;
        };
        user: {
            sub: string;
            email: string;
            admin: boolean;
            tournamentOrganizer: boolean;
            blogger: boolean;
        };
    }
}

// Use environment variable for JWT secret, generate strong random secret as fallback
// ⚠️ WARNING: Set JWT_SECRET in production environment variables!
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable must be set in production');
    }
    console.warn('⚠️  WARNING: Using auto-generated JWT secret. Set JWT_SECRET environment variable in production!');
    return crypto.randomBytes(64).toString('hex');
})();

export default fp(async (fastify: FastifyInstance) => {
    fastify.register(jwt, {
        secret: JWT_SECRET,
        sign: {
            expiresIn: '24h', // Token expires in 24 hours
        },
    });

    fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify();
        } catch (error) {
            // Don't leak token validation details
            reply.code(401).send({ 
                error: "Authentication required",
                message: "Invalid or expired token"
            });
        }
    });

    fastify.decorate("authenticateAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify();
            if (!request.user.admin) {
                reply.code(403).send({ 
                    error: "Forbidden",
                    message: "Admin privileges required" 
                });
            }
        } catch (error) {
            reply.code(401).send({ 
                error: "Authentication required",
                message: "Invalid or expired token"
            });
        }
    });
})
