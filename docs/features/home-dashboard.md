---
feature: Home Dashboard
number: 1
source-paths:
  - src/pages/HomePage.tsx
  - src/components/AwardLeaders.tsx
  - src/components/OffSeasonLanding.tsx
  - src/components/SeasonCountdown.tsx
  - src/components/LeagueFormatInfo.tsx
  - src/components/QRCodeModal.tsx
---

## Intent
Surfaces current league status at a glance — a recap/preview scoreboard for the most recent and next weeks, individual and team week highlights, nav cards, full standings table, and half-season award leaders. When the league is between seasons, replaces all of that with a landing view promoting the interest form and season history, plus a countdown to the upcoming season's Week 1.

## Key Behaviors
- When `useSeasonStatus().seasonActive` is false, render `OffSeasonLanding` instead of the normal dashboard: eyebrow/title/subtitle hero, a `SeasonCountdown` card, a `/contact` interest-form CTA (the `/history` CTA is temporarily hidden — see Notes), and a "How the League Works" section rendering the shared `LeagueFormatInfo` cards (Team Format, League Obligations, Dues & Fees) in a 3-up grid
- `SeasonCountdown` ticks once per second and displays days/hours/minutes/seconds until the upcoming season's Week 1 date; `OffSeasonLanding` shows the Week 1 calendar date (`MM/DD/YYYY`) directly beneath it
- A QR icon button in the top-right of the countdown card opens `QRCodeModal`, which generates a scannable QR code for the production site URL with Copy Image (Clipboard API) and Download (PNG) actions
- Toggle between "Week N Recap" (completed week scoreboard) and "Week N+1 Preview" (upcoming matchup pairings with team records); the preview is hidden after the final week configured in `leagueConfig.totalWeeks`
- Use Previous/Next controls around the recap tab to browse completed, publicly visible weeks; the latest completed week remains the default and navigation updates the scoreboard, highlights, playoff bracket, PDF shortcut, and detail link together
- View top-3 individual and team high game/series highlights for the selected recap week
- Click a matchup row to open MatchupDetailModal for per-bowler breakdown
- View full standings table (via LeagueStandings component)
- View half-season award leaders (via AwardLeaders component)
- Open standings PDF for the latest week when one is available

## Conditional Paths
- Off-season branch takes priority over everything below: checked once `useSeasonStatus()` finishes loading, before any of the in-season data is rendered
- Within `OffSeasonLanding`, if `upcomingSeasonYear` is unset, the subtitle falls back to generic phrasing ("the next season") instead of naming a year
- Within `OffSeasonLanding`, if the upcoming season's `scheduleWeeks` has no `week === 1` entry yet, the countdown card shows "Schedule coming soon" instead of `SeasonCountdown`
- If no matchupDetails exist yet, recap/preview panels show loading state
- Latest recap week is determined by `matchups.filter(m => m.completed)` max week — a week where `npm run fetch` ran before scores were entered in LeaguePals will NOT appear as the recap; it shows the prior week instead
- If the next configured week has no unfinished matchups, Preview panel shows an empty message
- If the latest completed week is the configured final week, no following-week Preview tab or panel is rendered
- AwardLeaders shows "Upcoming" status badge for the second half until any week in that range completes
- If the browser lacks Clipboard API / `ClipboardItem` support (or the write is rejected), `QRCodeModal`'s Copy Image button shows a transient "Copy failed" state instead of throwing; Download still works via a plain data-URL anchor regardless

## External Dependencies
- Firestore: matchupDetails, matchups, teams, bowlers, bowlerScores, scheduleWeeks, seasons
- SeasonContext for active season year and `useSeasonStatus()` (seasonActive, upcomingSeasonYear)
- useScheduleWeeks(upcomingSeasonYear) to resolve the Week 1 date for the countdown
- useBowlerScoresByWeek hook filters to non-blinded scores for individual highlights
- AwardLeaders additionally reads bowlers, matchupDetails, scheduleWeeks via its own hooks
- `qrcode` npm package (client-side QR generation, no network call) for `QRCodeModal`
- Clipboard API (`navigator.clipboard.write` + `ClipboardItem`) for the Copy Image action; not used by Download, which relies only on the `download` attribute of a data-URL anchor

## Known Issues
None

## Notes
Carousel component is NOT rendered on HomePage — it is not used here. Announcements badge lives in Header, not HomePage. LeagueStandings uses a hardcoded season year ('2025-2026') rather than SeasonContext.

All in-season data hooks (matchupDetails, teams, matchups, etc.) still run unconditionally even when the off-season branch is rendered, since hooks can't be called conditionally — their results are simply unused in that branch. This is a minor unnecessary-read cost, not a correctness issue.

The `/history` CTA in `OffSeasonLanding` is commented out, not deleted — re-enable by uncommenting the `Link` in `src/components/OffSeasonLanding.tsx`.

`LeagueFormatInfo` is shared with [Contact](contact.md) — it's the same Team Format / Obligations / Dues content, single-sourced so it can't drift between the two pages. `OffSeasonLanding.css` overrides the component's default single-column stack with a 3-column grid (collapsing to 1 column under 860px) to suit the wider landing-page layout, versus ContactPage's narrow sidebar.

`QRCodeModal` intentionally hardcodes the production URL (`https://late-night-happy-hour-league-site.vercel.app/`) rather than reading `window.location.origin`, so a code generated while testing locally (or on a preview deploy) still points visitors at the real site. The QR image itself is always rendered black-on-white regardless of the site's dark theme, since low-contrast QR modules can fail to scan reliably. `QRCodeModal` is currently only wired up inside `OffSeasonLanding`'s countdown card — it is not rendered anywhere in the normal in-season dashboard.
