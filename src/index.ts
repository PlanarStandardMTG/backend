import { buildServer } from "./server.js";

const app = buildServer();

app.listen({ port: 3000 }, () => {
    console.log("\n\nServer is running on http://localhost:3000");
})
