import { buildServer } from "./server.js";

const app = buildServer();

if (!process.env.VERCEL_ENV) {
    app.listen({ port: 3000 }).then(() => {
        console.log("\n\nServer listening on http://localhost:3000\n\n");
    })
}

export default async (req: any, res: any) => {
    await app.ready();
    app.server.emit("request", req, res);
}
