/**
 * Cloudflare Worker entry point.
 *
 * Exposes the MCP server over Streamable HTTP at `/mcp`.
 *
 * Optional protection (Roadmap 0.4): set the `MCP_API_KEY` secret
 * (`wrangler secret put MCP_API_KEY`) and every request to /mcp must carry it
 * (`Authorization: Bearer …`, `X-API-Key`, or `?key=`). Unset → open, as before.
 * CORS preflight is always answered so browser-based MCP clients can discover
 * the endpoint before authenticating.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools.mjs";
import { authorize, unauthorizedResponse } from "./lib/auth.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-API-Key,MCP-Protocol-Version,MCP-Session-Id",
  "Access-Control-Expose-Headers": "MCP-Session-Id,MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      const locked = Boolean(env?.MCP_API_KEY);
      return new Response(
        `Shamela MCP v2 চলছে ✅  Endpoint: /mcp${locked ? "  (API key required: Authorization: Bearer <key>)" : ""}\n` +
          "Content is fetched live from shamela.ws — see README «Terms, attribution & copyright».",
        { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    const auth = authorize(request, env);
    if (!auth.ok) {
      return unauthorizedResponse(auth.reason, { ...CORS, "WWW-Authenticate": 'Bearer realm="shamela-mcp"' });
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const res = await transport.handleRequest(request);
    // Mirror the permissive CORS the preflight promised on the real response.
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) if (!headers.has(k)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
