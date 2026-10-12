/**
 * The front ends that may call the API from a browser: the event manager's UI
 * and the main site. `FRONTEND_URL` adds more, comma-separated, without a
 * deploy of this list.
 */
const BUILT_IN = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://planarstandardmtg.vercel.app",
  "https://www.planarstandard.com",
  "https://planarstandard.com",
];

function allowedOrigins(): Set<string> {
  const extra = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  return new Set([...BUILT_IN, ...extra]);
}

/** CORS headers for a request's origin, or none when it isn't allowed. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins().has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    vary: "origin",
  };
}
