---
feature: Weekly Data Sync
type: component
generated: 2026-05-19
spec: ../../../features/weekly-data-sync.md
---

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class fetchLeagueData {
        <<script>>
        +LEAGUE_ID: string
        +ALL_TEAM_IDS: string[]
        +fetchJSON(url, options?): Promise~any~
        +save(filePath, data): void
        +fetchLaneSchedule(): Promise~void~
        +fetchStandings(): Promise~void~
        +fetchTops(): Promise~void~
        +fetchLeaguePublic(): Promise~void~
        +fetchFullLeagueInfo(): Promise~void~
        +fetchTeam(teamId): Promise~void~
        +main(): Promise~void~
    }

    class transformData {
        <<script>>
        +batchWrite(collection, docs, getDocId?): Promise~void~
        +clearCollection(collection): Promise~void~
        +loadJSON(filePath): any
        +buildTeams(): object[]
        +buildMatchups(): object
        +buildSeasons(): object[]
        +buildBowlerStats(): object[]
        +buildWeeklyMatchupDetails(): object[]
        +preserveAdminOverrides(collection): Promise~object[]~
        +restoreAdminOverrides(docs, collection?): Promise~void~
        +populateLeagueConfig(seasonYear): Promise~void~
        +populateSeasons(seasonYear): Promise~void~
        +populateScheduleWeeks(seasonYear): Promise~void~
        +populateTeams(seasonYear): Promise~void~
        +populateBowlers(seasonYear): Promise~void~
        +populateMatchups(seasonYear): Promise~Map~
        +populateMatchupDetails(seasonYear, matchupIdMap): Promise~void~
        +populateBowlerScores(seasonYear): Promise~void~
        +populateAnnouncements(seasonYear): Promise~void~
        +populateEvents(seasonYear): Promise~void~
        +populateCarouselImages(seasonYear): Promise~void~
        +main(): Promise~void~
    }

    class firebaseAdmin {
        <<external>>
        +initializeApp(options): App
        +firestore(): Firestore
        +credential.cert(serviceAccount): Credential
    }

    class leaguePalsAPI {
        <<external>>
        +GET /laneSchedule : LaneSchedule
        +GET /api/getStandingsPublic : Standings
        +POST /api/getTopsPublic : Tops
        +GET /getLeaguePublic : LeaguePublic
        +GET /fullLeagueInfoPublic : FullLeagueInfo
        +GET /api/loadIndividualTeamPublic : TeamRoster
    }

    class leaguePalsData {
        <<external>>
        +lane-schedule.json
        +standings.json
        +tops.json
        +league-public.json
        +full-league-info.json
        +teams/{teamId}.json
    }

    class srcData {
        <<external>>
        +teams.json
        +historicalMatches.json
        +matchups.json
        +seasons.json
        +weeklyMatchupDetails.json
        +bowlerStats.json
    }

    class Firestore {
        <<external>>
        +leagueConfig collection
        +seasons collection
        +scheduleWeeks collection
        +teams collection
        +bowlers collection
        +matchups collection
        +matchupDetails collection
        +bowlerScores collection
        +announcements collection
        +events collection
        +carouselImages collection
    }

    fetchLeagueData --> leaguePalsAPI : HTTP GET/POST
    fetchLeagueData --> leaguePalsData : writes raw JSON
    transformData --> leaguePalsData : reads raw JSON
    transformData --> srcData : writes transformed JSON
    transformData --> firebaseAdmin : uses for Firestore Admin SDK
    transformData --> Firestore : clears and rewrites 11 collections
    firebaseAdmin --> Firestore : Admin SDK connection
```
