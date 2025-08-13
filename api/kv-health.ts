// api/kv-health.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const key = "kv:health:test";
  const value = { ok: true, at: Date.now() };
  await kv.set(key, JSON.stringify(value), { ex: 60 });
  const got = await kv.get<string>(key);
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(got ?? "{}");
}
