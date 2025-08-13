// src/ratelimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Works with either UPSTASH_* or KV_* envs
const redis = new Redis({
  url:  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN!,
});

// 60 requests / minute per IP (sliding window). Tweak as you like.
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "rl:mcp",
});
