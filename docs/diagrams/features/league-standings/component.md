---
feature: League Standings
type: component
generated: 2026-05-19
spec: ../../../features/league-standings.md
---

Note: `AwardRow` appears as both a React component (`<<component>>`) here and a TypeScript interface
(`<<interface>>`) in the class diagram. The `+award: AwardRow` attribute is a type annotation
referencing the interface — it does not create a recursive relationship.

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class SeasonContext {
        <<context>>
        +useSeasonYear() string
    }
    class StandingsPage {
        <<component>>
    }
    class LeagueStandings {
        <<component>>
        ~useTeams(seasonYear: '2025-2026') Team[]
        ~teams: Team[]
        ~loading: boolean
    }
    class AwardLeaders {
        <<component>>
        ~useBowlers(seasonYear) Bowler[]
        ~useMatchupDetails(seasonYear) MatchupDetail[]
        ~useScheduleWeeks(seasonYear) ScheduleWeek[]
        ~isLoading: boolean
    }
    class HalfAwards {
        <<component>>
        +title: string
        +awards: AwardGroups
        +complete: boolean
        +hasData: boolean
    }
    class AwardRow {
        <<component>>
        +award: AwardRow
    }

    SeasonContext ..> AwardLeaders : provides seasonYear
    StandingsPage --> LeagueStandings : renders
    StandingsPage --> AwardLeaders : renders
    AwardLeaders "1" --> "2" HalfAwards : renders
    HalfAwards "1" --> "7" AwardRow : renders
```
