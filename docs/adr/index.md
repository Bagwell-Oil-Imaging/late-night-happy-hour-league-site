# Architecture Decision Records

All significant architecture decisions for this project are recorded here. The **Rejected Alternatives** section of each ADR is the most important part for future sessions — it prevents re-evaluating options that were already considered and rejected.

| ADR | Title | Status | Date | Summary |
|-----|-------|--------|------|---------|
| [ADR-001](001-firestore-over-static-json.md) | Firestore Over Static JSON | Accepted | 2026-04-18 | Replaced static JSON files with Firestore for live data and admin CRUD |
| [ADR-002](002-google-drive-over-firebase-storage.md) | Google Drive Over Firebase Storage | Accepted | 2026-04-22 | Service account quota limitation forced switch to OAuth2 + personal Drive |
| [ADR-003](003-vercel-serverless-for-drive-upload.md) | Vercel Serverless for Drive Upload | Accepted | 2026-04-22 | OAuth credentials cannot be exposed to browser; Vercel api/ handles server-side auth |
| [ADR-004](004-leaguepals-api-as-data-source.md) | LeaguePals API as Data Source | Accepted | 2026-04-18 | Official league data source via fetch/transform pipeline eliminates manual entry |
| [ADR-005](005-vite-spa-over-nextjs.md) | Vite SPA Over Next.js | Accepted | 2026-04-17 | No SSR or SEO requirements; SPA is simpler and sufficient |
