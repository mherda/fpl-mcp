import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUpstream, setBootstrap } from "../../src/cache.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const json = await fetchUpstream();
    await setBootstrap(json);
    res.status(200).send("ok");
  } catch (e: any) {
    res.status(500).send(e?.message ?? "failed");
  }
}
