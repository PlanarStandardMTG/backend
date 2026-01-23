import Fastify from "fastify";
import cors from "@fastify/cors";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import securityPlugin from "./plugins/security.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { testRoutes } from "./routes/testRoutes.js";
import { matchRoutes } from "./routes/matches.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { adminRoutes } from "./routes/admin.js";
import challongeRoutes from "./routes/challonge.js";

export function buildServer() {
    const app = Fastify({
        logger: process.env.NODE_ENV === 'production' ? true : false,
        bodyLimit: 1048576, // 1MB limit for request bodies
        trustProxy: true, // Trust proxy headers for rate limiting
    });

    // CORS configuration
    app.register(cors, {
        origin: [
            "http://localhost:5173",
            "https://planarstandardmtg.vercel.app"
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        credentials: true,
        preflight: true,
        preflightContinue: false
    });

    // Security plugins (rate limiting, helmet, CSRF protection)
    app.register(securityPlugin);

    // Database plugin
    app.register(prismaPlugin);

    // Request logging
    app.addHook("onRequest", async (request, reply) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${request.method} ${request.url} - IP: ${request.ip}`);
    });

    // Global error handler
    app.setErrorHandler((error, request, reply) => {
        // Log error details internally
        console.error('Error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
            url: request.url,
            method: request.method,
        });

        // Don't leak internal error details to client
        const statusCode = (error as any).statusCode || 500;
        const message = statusCode === 500 && process.env.NODE_ENV === 'production'
            ? 'An internal error occurred'
            : error instanceof Error ? error.message : 'Unknown error';

        reply.code(statusCode).send({
            error: error instanceof Error ? error.name : 'Error',
            message,
            statusCode,
        });
    });

    // Authentication plugin
    app.register(authPlugin);
    
    // Route registration
    app.register(authRoutes, { prefix: "/api/auth" });
    app.register(userRoutes, { prefix: "/api/users" });
    app.register(testRoutes, { prefix: "/api/test" });
    app.register(matchRoutes, { prefix: "/api/matches" });
    app.register(dashboardRoutes, { prefix: "/api/dashboard" });
    app.register(leaderboardRoutes, { prefix: "/api/leaderboard" });
    app.register(adminRoutes, { prefix: "/api/admin" });
    app.register(challongeRoutes, { prefix: "/api/challonge" });

    return app;
}