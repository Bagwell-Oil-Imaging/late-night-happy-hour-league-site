---
feature: Bowler Profiles
type: component
generated: 2026-05-19
spec: ../../../features/bowler-profiles.md
---

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class SeasonContext {
        <<context>>
        +currentSeasonYear: string
    }

    class BowlersPage {
        <<component>>
        ~searchParams: URLSearchParams
        ~sortedBowlers: Bowler[]
        ~bowlersByTeam: Record~string, TeamGroup~
        ~selectedBowlerId: string
        +useSeasonYear() string
        +useBowlers(seasonYear) Bowler[]
    }

    class BowlerDetailPanel {
        <<component>>
        +bowler: Bowler
        ~scores: BowlerScore[]
        ~scoresLoading: boolean
        +useSeasonYear() string
        +useBowlerScores(bowlerId, seasonYear) BowlerScore[]
    }

    class ScoresTable {
        <<component>>
        +scores: BowlerScore[]
        +bowler: Bowler
    }

    class BowlerProfileModal {
        <<component>>
        +bowlerId: string | null
        +onClose: () => void
        ~bowlerLoading: boolean
        ~scoresLoading: boolean
        +useSeasonYear() string
        +useBowler(bowlerId) Bowler | null
        +useBowlerScores(bowlerId, seasonYear) BowlerScore[]
    }

    SeasonContext ..> BowlersPage : provides seasonYear
    SeasonContext ..> BowlerDetailPanel : provides seasonYear
    SeasonContext ..> BowlerProfileModal : provides seasonYear
    BowlersPage --> BowlerDetailPanel : renders selected bowler
    BowlerDetailPanel --> ScoresTable : renders when scores loaded
    BowlerProfileModal --> ScoresTable : renders when scores loaded
```

> **Note:** `BowlerProfileModal` is a separate component invoked by `MatchupDetailModal`
> and `HomePage` for drill-through from matchup rows. `BowlersPage` uses an inline
> `BowlerDetailPanel` (not the modal). Both share the same `ScoresTable` sub-component shape
> but each file defines its own local copy.
