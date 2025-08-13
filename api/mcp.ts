// api/mcp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFplTools } from "../src/tools.js";
import { ratelimit } from "../src/rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  }

  // ---- Rate limit (allow admin bypass if you want) ----
  const adminBypass = process.env.MCP_ADMIN_TOKEN && req.headers.authorization === `Bearer ${process.env.MCP_ADMIN_TOKEN}`;
  if (!adminBypass) {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      (req.socket as any)?.remoteAddress ||
      "unknown";

    const { success, limit, remaining, reset } = await ratelimit.limit(ip);

    // Useful headers for clients
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Reset", String(reset));

    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
  }
  // -----------------------------------------------------

  try {
    const server = new McpServer({ name: "fpl-mcp", version: "1.0.0" });
    registerFplTools(server);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}

