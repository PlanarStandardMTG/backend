import { corsHeaders } from "../src/cors.js";

/** Whether the API is up, and which commit answered. */
export function GET(request: Request): Response {
  return Response.json(
    {
      service: "planar-events-api",
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    { headers: corsHeaders(request) },
  );
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
