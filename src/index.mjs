/**
 * Cloudflare Worker entry point (reconstructed source — supersedes worker.mjs).
 *
 * Exposes the MCP server over Streamable HTTP at `/mcp`.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools.mjs";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("Shamela MCP v2 চলছে ✅  Endpoint: /mcp", { status: 200 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Accept,MCP-Protocol-Version,MCP-Session-Id",
        },
      });
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
