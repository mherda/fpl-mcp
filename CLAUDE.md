# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an FPL (Fantasy Premier League) MCP (Model Context Protocol) server that provides tools for accessing Fantasy Premier League data. It's deployed on Vercel and uses Redis for caching and rate limiting.

## Architecture

- **MCP Server**: Built using `@modelcontextprotocol/sdk` with HTTP transport
- **Deployment**: Vercel serverless functions with TypeScript ES modules
- **Caching**: Redis (Vercel KV) for FPL API data with 1-hour TTL and stale-while-revalidate
- **Rate Limiting**: 60 requests per minute per IP using Upstash Redis
- **Data Source**: Fantasy Premier League bootstrap API (`https://fantasy.premierleague.com/api/bootstrap-static/`)

## Key Components

### API Endpoints
- `api/mcp.ts` - Main MCP server endpoint with rate limiting and admin bypass
- `api/cron/fpl-refresh.ts` - Hourly cron job to refresh cached FPL data
- `api/kv-health.ts` - Health check endpoint for Redis/KV connectivity

### Core Modules
- `src/tools.ts` - MCP tool definitions (get_player_price, top_by_price, refresh_bootstrap)
- `src/cache.ts` - FPL data caching logic with stale-while-revalidate pattern
- `src/rateLimit.ts` - Rate limiting configuration using Upstash

### Tool Schemas
- Player lookup by ID or fuzzy name matching
- Top N players by price within positions (1=GKP, 2=DEF, 3=MID, 4=FWD)
- Manual cache refresh capability

## Development Commands

### Build and Type Checking
```bash
npx tsc --noEmit  # Type check without emitting files
```

### Local Development
Since this is a Vercel project, use Vercel CLI for local development:
```bash
vercel dev
```

### Environment Variables Required
- `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` - Redis connection URL
- `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` - Redis auth token
- `MCP_ADMIN_TOKEN` (optional) - Bypass rate limiting for admin access

## Configuration Notes

- Uses ES modules (`"type": "module"`)
- Requires Node.js 20+
- TypeScript configured for bundler module resolution
- Vercel cron runs hourly to refresh FPL data cache
- Rate limit: 60 requests/minute per IP with sliding window
- Cache TTL: 1 hour with 2-hour Redis expiry for stale serving