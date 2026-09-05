import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./src/index.mjs";
import { createServer, SERVER_VERSION } from "./src/tools.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = "0.0.0.0";

// Re-use an McpServer instance for inspecting tools and local browser tool execution
const localMcpServer = createServer();

const server = http.createServer(async (req, res) => {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `${protocol}://${host}`);
    const pathname = url.pathname;

    // 1. Health check endpoint
    if (pathname === "/api/health" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(
        JSON.stringify({
          ok: true,
          status: "healthy",
          server: "shamela-mcp",
          version: SERVER_VERSION,
          port: PORT,
          tools_count: Object.keys(localMcpServer._registeredTools).length,
          endpoint: "/mcp",
        })
      );
      return;
    }

    // 2. Tools metadata endpoint for web UI / discovery
    if (pathname === "/api/tools" && req.method === "GET") {
      const tools = Object.entries(localMcpServer._registeredTools).map(([name, t]) => ({
        name,
        description: t.description || "",
      }));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ ok: true, version: SERVER_VERSION, tools }));
      return;
    }

    // 3. Direct tool execution endpoint for interactive UI explorer
    if (pathname === "/api/call-tool" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "bad_json" }));
        return;
      }

      const { name, arguments: toolArgs = {} } = body;
      const registered = localMcpServer._registeredTools[name];
      if (!registered) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: `Tool '${name}' not found` }));
        return;
      }

      try {
        const toolResult = await registered.handler(toolArgs);
        let parsed = null;
        try {
          parsed = JSON.parse(toolResult.content[0].text);
        } catch {
          parsed = toolResult.content[0].text;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ok: true, tool: name, result: parsed, rawResult: toolResult }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, tool: name, error: err.message || String(err) }));
      }
      return;
    }

    // 4. Serve index.html for browser preview at root "/" or "/index.html"
    const isBrowserHtml =
      req.method === "GET" &&
      (pathname === "/" || pathname === "/index.html") &&
      (req.headers.accept?.includes("text/html") || pathname === "/index.html");

    if (isBrowserHtml) {
      try {
        const htmlPath = path.join(__dirname, "index.html");
        const html = await fs.readFile(htmlPath, "utf-8");
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      } catch (e) {
        console.warn("Could not read index.html, falling back to worker fetch:", e.message);
      }
    }

    // 5. Delegate all other requests (especially /mcp, OPTIONS, and programmatic GET /) to Cloudflare/Worker entrypoint
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, item);
      } else {
        headers.set(k, v);
      }
    }

    let bodyBuffer = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        bodyBuffer = Buffer.concat(chunks);
      }
    }

    const init = {
      method: req.method,
      headers,
    };
    if (bodyBuffer) {
      init.body = bodyBuffer;
    }

    const standardReq = new Request(url.toString(), init);
    const standardRes = await worker.fetch(standardReq, process.env);

    res.statusCode = standardRes.status;
    res.statusMessage = standardRes.statusText;

    standardRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    if (standardRes.body) {
      const reader = standardRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("Unhandled server error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "server_error", message: err.message }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Shamela MCP server running on http://${HOST}:${PORT}`);
  console.log(`MCP Endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Health Check: http://${HOST}:${PORT}/api/health`);
});
