// api/mcp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFplTools } from "../src/tools.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    return;
  }
  try {
    const server = new McpServer({ name: "fpl-mcp", version: "1.0.0" });
    registerFplTools(server);

    // Stateless: create transport per request (recommended for serverless)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Optional: expose the session header if a browser-based client cares to read it
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}
