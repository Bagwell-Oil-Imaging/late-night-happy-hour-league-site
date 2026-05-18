# ADR-005: Vite SPA Over Next.js

**Status:** Accepted  
**Date:** 2026-04-17

## Context
Needed a React framework choice at project start. Next.js is the dominant React framework; Vite is the dominant build tool for SPAs.

## Decision
Use Vite + React Router as a single-page application. No server-side rendering.

## Rejected Alternatives
- **Next.js App Router** — SSR and RSC complexity not justified for a private bowling league site with no SEO requirements; the admin panel is auth-gated so server rendering adds nothing
- **Remix** — same SSR overhead as Next.js; smaller ecosystem for this use case
- **Create React App** — deprecated; Vite is the successor

## Consequences
- All routing is client-side via React Router v7
- No built-in API routes — server-side logic lives in `api/` (Vercel Functions)
- No SSR means no server-rendered meta tags — acceptable since this is a private league site, not a public SEO-optimized product
- Fast local dev with Vite HMR
- `vercel dev` required to test `api/` endpoints locally alongside the Vite dev server

## Revisit When
- SEO becomes a requirement (e.g., site goes public and needs search indexing)
- Server components would meaningfully reduce bundle size or improve performance
