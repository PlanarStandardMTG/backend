import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The front ends that may call the API from a browser. `FRONTEND_URL` adds
 * more, comma-separated.
 *
 * Inline because a function importing from `src/` crashes on Vercel today
 * (ERR_REQUIRE_ESM); EM1.4 bundles the app and moves this into middleware.
 */
const ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://planarstandardmtg.vercel.app",
  "https://www.planarstandard.com",
  "https://planarstandard.com",
];

function corsHeaders(origin: string | undefined): Record<string, string> {
  const extra = (process.env.FRONTEND_URL ?? "").split(",").map((origin) => origin.trim());
  if (origin === undefined || ![...ORIGINS, ...extra].includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    vary: "origin",
  };
}

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
