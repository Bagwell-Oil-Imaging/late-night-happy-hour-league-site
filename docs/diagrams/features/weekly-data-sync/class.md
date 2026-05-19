---
feature: Weekly Data Sync
type: class
generated: 2026-05-19
spec: ../../../features/weekly-data-sync.md
---

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class Team {
        <<Firestore>>
        +leaguePalsId: string
        +adminOverride: boolean
        +displayId: number
        +seasonYear: string
        +name: string
        +captainName: string
        +captainBowlerId: string | null
        +wins: number
        +losses: number
        +ties: number
        +points: number
        +pointsWon: number
        +pointsLost: number
        +pctWon: number
        +average: number
        +scratchPins: number
        +totalPins: number
        +highGame: number
    }

    class Bowler {
        <<Firestore>>
        +leaguePalsId: string
        +adminOverride: boolean
        +seasonYear: string
        +teamId: string
        +teamName: string
        +firstName: string
        +lastName: string
        +average: number
        +enteringAvg: number
        +highGame: number
        +highSeries: number
        +gamesPlayed: number
        +blindWeeksTotal: number
        +indPointsWon: number
    }

    class BowlerScore {
        <<Firestore>>
        +adminOverride: boolean
        +bowlerId: string
        +bowlerName: string
        +teamId: string
        +opponentTeamId: string
        +matchupId: string
        +seasonYear: string
        +week: number
        +date: string
        +actualBowlDate: string | null
        +lanePair: number
        +game1: number | null
        +game2: number | null
        +game3: number | null
        +series: number | null
        +preBowled: boolean
        +blinded: boolean
        +isSubstitute: boolean
        +substituteFor: string | null
        +rollingAvg: number | null
        +rollingGames: number
    }

    class Matchup {
        <<Firestore>>
        +leaguePalsMatchId: string
        +seasonYear: string
        +week: number
        +date: string
        +team1Id: string
        +team2Id: string
        +team1Lane: number
        +team2Lane: number
        +team1ScratchScore: number | null
        +team2ScratchScore: number | null
        +positionRound: boolean
        +completed: boolean
    }

    class MatchupDetail {
        <<Firestore>>
        +adminOverride: boolean
        +matchupId: string
        +seasonYear: string
        +week: number
        +date: string
        +team1: TeamSummary
        +team2: TeamSummary
    }

    class TeamSummary {
        <<interface>>
        +teamId: string
        +teamName: string
        +lane: number
        +teamAvg: number
        +game1Total: number
        +game2Total: number
        +game3Total: number
        +scratchSeries: number
        +handicapPerGame: number
        +handicapSeries: number
        +totalSeries: number
        +points: number
        +individualScoresUnavailable: boolean
    }

    class ScheduleWeek {
        <<Firestore>>
        +week: number | null
        +date: string
        +seasonYear: string
        +status: string
        +positionRound: boolean
        +skipReason: string | null
        +event: string | null
    }

    class Season {
        <<Firestore>>
        +year: string
        +startDate: string
        +endDate: string
        +championTeamId: string | null
        +championTeamName: string | null
        +teams: SeasonTeam[]
    }

    class LeagueConfig {
        <<Firestore>>
        +seasonYear: string
        +leagueName: string
        +numTeams: number
        +bowlersPerTeam: number
        +gamesPerNight: number
        +totalWeeks: number
        +handicapPct: number
        +handicapBase: number
        +blindScorePct: number
        +leaguePalsId: string
    }

    %% Cross-module relationships
    MatchupDetail --> TeamSummary : team1 / team2
    BowlerScore --> Bowler : bowlerId FK
    BowlerScore --> Team : teamId FK
    BowlerScore --> Matchup : matchupId FK
    Matchup --> Team : team1Id / team2Id FK
    MatchupDetail --> Matchup : matchupId FK (1:1)
    Bowler --> Team : teamId FK
    Season --> ScheduleWeek : seasonYear scoping
    LeagueConfig --> Season : seasonYear scoping
```
