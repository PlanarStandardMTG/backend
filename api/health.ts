import type { IncomingMessage, ServerResponse } from "node:http";

import { corsHeaders } from "../src/cors.js";

/** Whether the API is up, and which commit answered. */
export default function health(request: IncomingMessage, response: ServerResponse): void {
  const headers = corsHeaders(request.headers.origin);
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers).end();
    return;
  }
  response.writeHead(200, { ...headers, "content-type": "application/json" }).end(
    JSON.stringify({
      service: "planar-events-api",
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    }),
  );
}
