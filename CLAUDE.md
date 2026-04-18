# Late Night Happy Hour Bowling League — Claude Code Notes

## Project Structure

```
late-night-happy-hour-league-site/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── admin/            # Admin auth guard and layout wrapper
│   │   ├── Calendar.tsx
│   │   ├── Carousel.tsx
│   │   ├── FutureMatchups.tsx
│   │   ├── Header.tsx
│   │   ├── HistoricalScores.tsx
│   │   ├── LeagueStandings.tsx
│   │   └── UpcomingEvents.tsx
│   ├── hooks/                # Firestore React hooks
│   │   ├── useFirestore.ts   # Generic useCollection<T> and useDocument<T>
│   │   └── index.ts          # Domain-specific hooks (useTeams, useMatchups, etc.)
│   ├── pages/                # Route-level page components
│   │   └── admin/            # Admin CRUD panel pages
│   ├── types/
│   │   └── index.ts          # All TypeScript interfaces (Firestore schema)
│   ├── utils/
│   │   └── admin.ts          # Admin utility helpers
│   ├── firebase.ts           # Firebase app initialization (db, auth, storage)
│   ├── App.tsx
│   ├── App.css
│   ├── main.tsx
│   └── index.css
├── scripts/                  # Node.js data pipeline scripts
│   ├── fetch-league-data.js  # Fetches raw data from LeaguePals API
│   ├── transform-data.js     # Transforms and writes all 12 Firestore collections
│   ├── seed-firestore.js     # One-time seeder from existing src/data JSON files
│   └── verify-seed.js        # Validates Firestore collection document counts
├── leaguepals-data/          # Raw API response data (gitignored)
├── bylaws/                   # League bylaws PDF files
├── public/                   # Static assets
├── firestore.rules           # Firestore security rules (public read, auth write)
├── firestore.indexes.json    # Composite index definitions
├── storage.rules             # Firebase Storage security rules
├── firebase.json             # Firebase project deployment config
├── .env.example              # Required environment variables
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json               # Vercel deployment config
```

## Architecture

Data flows from LeaguePals API → `fetch-league-data.js` → `leaguepals-data/` → `transform-data.js` → Firestore.

React components read from Firestore via domain hooks in `src/hooks/index.ts`, which wrap the generic `useCollection<T>` and `useDocument<T>` hooks defined in `src/hooks/useFirestore.ts`.

All 12 Firestore collections:
- `teams` — Team records and standings
- `bowlers` — Bowler profiles and averages
- `bowlerScores` — Individual game scores per week
- `matchups` — Weekly team matchups (schedule)
- `weeklyMatchupDetails` — Detailed per-team, per-week score breakdowns
- `scheduleWeeks` — Week metadata and dates
- `seasons` — Season configuration
- `leagueConfig` — League-wide settings
- `announcements` — Admin-managed announcements
- `events` — Admin-managed league events
- `carouselImages` — Admin-managed homepage carousel images
- `documents` — Bylaws/documents with PDF storage references

## Environment Setup

Copy `.env.example` to `.env` and fill in all `VITE_FIREBASE_*` values from the Firebase Console (Project Settings → Your Apps → SDK setup and configuration).

For running the transform pipeline (`npm run update-data`), also set `FIREBASE_SERVICE_ACCOUNT_PATH` to a local service account JSON file path (Firebase Console → Project Settings → Service accounts → Generate new private key).

## npm Scripts

- `npm run dev` — Start Vite dev server (http://localhost:5173)
- `npm run build` — TypeScript compile + Vite production build
- `npm run fetch` — Fetch raw data from LeaguePals API into `leaguepals-data/`
- `npm run transform` — Transform fetched data and write to Firestore
- `npm run update-data` — `fetch` + `transform` in sequence (full pipeline)
- `npm run seed` — One-time seed from JSON files (bootstrap only, now obsolete)
- `npm run verify-seed` — Validate Firestore collection document counts

## Admin UI

The admin panel is accessible at `/admin/login`. Authentication uses Firebase Auth (email/password). The admin route guard (`src/components/admin/`) redirects unauthenticated users to the login page.

Admin panels available:
- `/admin/announcements` — Create, edit, delete announcements
- `/admin/events` — Create, edit, delete league events
- `/admin/carousel` — Manage homepage carousel images (Firebase Storage)
- `/admin/documents` — Upload and version PDF bylaws/documents

## AI-Assisted Changes

- **Phase 1** (Firebase Foundation): Deployed Firestore/Storage security rules, seeded 12 collections from static JSON, validated counts.
- **Phase 2** (Transform Script Rework): Rewired `scripts/transform-data.js` to write directly to Firestore using `firebase-admin` batch writes.
- **Phase 3** (React Foundation): Updated all TypeScript interfaces to match Firestore schema; created generic and domain-specific Firestore hooks.
- **Phase 4** (Component Migration): Migrated all React components from static JSON imports to Firestore hooks.
- **Phase 5** (Admin CRUD UI): Built Firebase Auth–gated admin panels for announcements, events, carousel images, and documents.
- **Phase 6** (Cleanup): Removed all static `src/data/*.json` files; resolved TypeScript errors; updated documentation.

## Known Issues / Limitations

- The JS bundle is large (~778 KB minified). Code-splitting with dynamic imports would reduce initial load time.
- `scripts/seed-firestore.js` requires the original JSON files in `src/data/` which have been deleted — this script is no longer usable and exists only for historical reference.

## Future Considerations

- Add real-time Firestore listeners (`onSnapshot`) for live score updates during league night.
- Implement composite Firestore indexes for complex queries (e.g., `bowlerScores` ordered by `weekId` + `teamId`).
- Consider lazy-loading admin route chunks to reduce initial bundle size.
