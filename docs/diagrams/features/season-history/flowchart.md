---
feature: Season History
type: flowchart
generated: 2026-05-19
spec: ../../../features/season-history.md
---

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'edgeLabelBackground': '#1e1e2e', 'clusterBkg': '#252535', 'clusterBorder': '#4a4a6a'}}}%%
flowchart TD
    A([User navigates to /history]):::trigger
    B[HistoryPage mounts\nexpandedSeason = null]
    C[(seasons collection)]:::db
    D{Loading seasons?}
    E[Show loading placeholder]
    F[Resolve activeExpanded\nexpandedSeason ?? seasons[0].year]
    G[Render accordion list\nmost recent season auto-expanded]
    H([User clicks season card header]):::trigger
    I{Clicked season\nalready expanded?}
    J[Set expandedSeason = null\nall cards collapse]
    K[Set expandedSeason = year\ncard expands]
    L[Render expanded season card\nchampion preview in header]
    M[Sort embedded teams\nby points desc]
    N[Render standings table\nrank · team · W · L · points]
    O{Has embedded teams?}
    P[Render champion row\nwith trophy icon]
    Q[Table renders no rows]

    A --> B
    B -->|useSeasons| C
    C --> D
    D -- yes --> E
    D -- no --> F
    F --> G
    G --> H
    H --> I
    I -- yes --> J
    I -- no --> K
    K --> L
    L --> M
    M --> O
    O -- has teams --> N
    O -- empty --> Q
    N --> P

    classDef trigger  fill:#0d47a1,stroke:#42a5f5,color:#fff
    classDef db       fill:#bf360c,stroke:#ff8a65,color:#fff
    classDef external fill:#4a148c,stroke:#ce93d8,color:#fff
    classDef admin    fill:#1b5e20,stroke:#81c784,color:#fff
    classDef blocked  fill:#b71c1c,stroke:#ef9a9a,color:#fff
```

> **Note:** `season.teams[]` is embedded data inside each `Season` document — no separate
> `teams` collection query is made. `HistoryPage` manages its own `expandedSeason` state
> independently of `SeasonContext`; the current season year is not used here.
