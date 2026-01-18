import Fastify from "fastify";
import cors from "@fastify/cors";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { testRoutes } from "./routes/testRoutes.js";
import { matchRoutes } from "./routes/matches.js";
import { dashboardRoutes } from "./routes/dashboard.js";

export function buildServer() {
    const app = Fastify();

    app.register(cors);
    app.register(prismaPlugin);
    app.register(authPlugin);
    app.register(authRoutes, { prefix: "/api/auth" });

    app.register(testRoutes, { prefix: "/api/test" });
    app.register(matchRoutes, { prefix: "/api/matches" });
    app.register(dashboardRoutes, { prefix: "/api/dashboard" });

    return app;
}