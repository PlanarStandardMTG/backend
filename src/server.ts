import Fastify from "fastify";
import cors from "@fastify/cors";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { testRoutes } from "./routes/testRoutes.js";
import { matchRoutes } from "./routes/matches.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { adminRoutes } from "./routes/admin.js";
import challongeRoutes from "./routes/challonge.js";

export function buildServer() {
    const app = Fastify();

    app.register(cors, {
        origin: [
            "http://localhost:5173",
            "https://planarstandardmtg.vercel.app"
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        preflight: true,
        preflightContinue: false
    });

    app.register(prismaPlugin);

    app.addHook("onRequest", async (request, reply) => {
        console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
    });


    app.register(authPlugin);
    app.register(authRoutes, { prefix: "/api/auth" });

    app.register(testRoutes, { prefix: "/api/test" });

    app.register(matchRoutes, { prefix: "/api/matches" });
    app.register(dashboardRoutes, { prefix: "/api/dashboard" });
    app.register(leaderboardRoutes, { prefix: "/api/leaderboard" });
    app.register(adminRoutes, { prefix: "/api/admin" });
    
    app.register(challongeRoutes, { prefix: "/api/challonge" });

    return app;
}