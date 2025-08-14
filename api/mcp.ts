// api/mcp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFplTools } from "../src/tools.js";
import { ratelimit } from "../src/ratelimit.js";

const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CORS (preflight) ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
    res.setHeader("Allow", "POST, OPTIONS");
    return res
      .status(405)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  }

  // CORS for actual response
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  // ---- Rate limit (admin bypass supported via Authorization: Bearer <MCP_ADMIN_TOKEN>) ---
  const adminBypass =
    process.env.MCP_ADMIN_TOKEN && req.headers.authorization === `Bearer ${process.env.MCP_ADMIN_TOKEN}`;

  if (!adminBypass) {
    try {
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.headers["x-real-ip"] as string) ||
        req.socket?.remoteAddress ||
        "unknown";

      const { success, limit, remaining, reset } = await ratelimit.limit(`mcp:${ip}`);

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
      res.setHeader("X-RateLimit-Reset", String(reset));

      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
      }
    } catch (e) {
      // If ratelimit misconfigured, don't hard-fail requests
      console.error("ratelimit error:", e);
    }
  }

  try {
    const server = new McpServer({ name: "fpl-mcp", version: "1.0.0" });
    registerFplTools(server);

    // Stateless per-request transport for serverless
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    /**
     * IMPORTANT:
     * - If req.body is already a string (raw JSON), pass that.
     * - If it's a Buffer, convert to string.
     * - Otherwise, pass `undefined` so the transport will read the Node stream itself.
     *   (Avoid JSON.stringify-ing objects here — that can double-encode and
     *   lead to "expected object, received string" validation errors.)
     */
    let bodyArg: string | undefined = undefined;
    if (typeof req.body === "string") {
      bodyArg = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      bodyArg = req.body.toString("utf8");
    } // else leave undefined

    await server.connect(transport);
    await transport.handleRequest(req, res, bodyArg);
  } catch (err) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}
