# ADR-004: LeaguePals API as Data Source

**Status:** Accepted  
**Date:** 2026-04-18

## Context
League scores, standings, and schedules need to be kept current each week. The data originates in LeaguePals, the league management software used by the bowling alley.

## Decision
Fetch data from the LeaguePals API via `scripts/fetch-league-data.js` and transform it into Firestore collections via `scripts/transform-data.js`. Run as `npm run update-data` after each league night.

## Rejected Alternatives
- **Manual data entry via admin panel** — error-prone; duplicates work already done in LeaguePals; not sustainable over a season
- **Screen scraping the LeaguePals website** — fragile; breaks on any UI change; LeaguePals has an API
- **Embedding LeaguePals iframes** — no control over appearance; doesn't support custom admin features

## Consequences
- `npm run update-data` must be run manually after each Thursday league night
- Raw API responses cached in `leaguepals-data/` (gitignored)
- Pipeline is the single source of truth for scores, standings, bowler averages, and schedule
- Any data corrections must be made either in LeaguePals (then re-run pipeline) or via the DataCorrectionAdmin panel

## Revisit When
- LeaguePals changes or removes their API
- The league switches to a different management platform
