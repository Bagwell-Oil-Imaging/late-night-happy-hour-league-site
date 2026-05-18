# ADR-001: Firestore Over Static JSON

**Status:** Accepted  
**Date:** 2026-04-18

## Context
The site originally loaded all league data from static JSON files in `src/data/`. This required a manual file update and redeploy for every data change and made an admin panel impossible.

## Decision
Replace all static JSON files with Firestore collections. A Node.js pipeline (`fetch` → `transform`) writes to Firestore. React components read via hooks.

## Rejected Alternatives
- **Keep static JSON** — requires a redeploy for every data change; no path to admin CRUD
- **REST API / Express backend** — more infrastructure to maintain; Firestore gives real-time reads for free with the Firebase client SDK
- **Supabase / Postgres** — relational model is overkill for this data shape; Firestore integrates with Firebase Auth already in use

## Consequences
- All 12 collections must be kept in sync by running `npm run update-data` after each league night
- Admin panel is possible and was built (announcements, events, carousel, documents)
- Bundle includes Firebase SDK (~200 KB)

## Revisit When
- League data needs complex relational queries that Firestore indexes can't satisfy
- Firebase pricing becomes a concern at scale
