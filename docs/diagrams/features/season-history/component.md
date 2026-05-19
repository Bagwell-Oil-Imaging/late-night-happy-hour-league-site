---
feature: Season History
type: component
generated: 2026-05-19
spec: ../../../features/season-history.md
---

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class HistoryPage {
        <<component>>
        ~seasons: Season[]
        ~loading: boolean
        ~expandedSeason: string | null
        +useSeasons() Season[]
        +toggleSeason(year) void
        +formatDate(dateString) string
    }

    class SeasonCard {
        <<component>>
        +season: Season
        +isExpanded: boolean
        +onToggle: (year) => void
    }

    class SeasonStandingsTable {
        <<component>>
        +sortedTeams: SeasonTeam[]
    }

    HistoryPage --> SeasonCard : renders one per season
    SeasonCard --> SeasonStandingsTable : renders when expanded
```

> **Note:** `SeasonCard` and `SeasonStandingsTable` are not named components — they are
> inline JSX inside `HistoryPage`'s `.map()`. They are shown as logical components here
> for clarity. All state (`expandedSeason`) and data (`seasons`) live in `HistoryPage`.
> Team data is embedded as `season.teams[]` — no child component fetches from Firestore.
