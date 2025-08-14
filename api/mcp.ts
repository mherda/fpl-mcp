// api/mcp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFplTools } from "../src/tools.js";
import { ratelimit } from "../src/rateLimit.js";

const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";

async function ensureBodyString(req: VercelRequest): Promise<string> {
  // Already a JSON string?
  if (typeof req.body === "string") return req.body;

  // Buffer?
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");

  // Parsed object?
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  // Fallback: read raw request stream
  const chunks: Buffer[] = [];
  for await (const chunk of req as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CORS preflight ---
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

  // --- Rate limit (admin bypass supported) ---
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
      console.error("ratelimit error:", e);
      // Continue anyway; don't block requests on RL misconfig
    }
  }

  try {
    const server = new McpServer({ name: "fpl-mcp", version: "1.0.0" });
    registerFplTools(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // IMPORTANT: always pass a *JSON string* body to the MCP transport
    const body = await ensureBodyString(req);

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}
