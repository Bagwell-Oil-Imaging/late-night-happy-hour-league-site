---
feature: Announcements
type: flowchart
generated: 2026-05-19
spec: ../../../features/announcements.md
---

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'edgeLabelBackground': '#1e1e2e', 'clusterBkg': '#252535', 'clusterBorder': '#4a4a6a'}}}%%
flowchart TD
    A([App mounts — Header renders]):::trigger
    B[(announcements collection)]:::db
    C[useAnnouncements fetches all docs\nclient-side expiry filter applied]
    D[Client filters expired items\nexpiresAt < today removed in JS]
    E[Sort: pinned first → priority high/normal/low → date desc]
    F{announcementsCount > 0?}
    G[Header shows badge\nwith count]
    H[Badge hidden]
    I([User clicks Announcements nav button]):::trigger
    J[AnnouncementsModal opens\nisOpen = true · body scroll locked]
    K{Modal loading?}
    L[Show loading state]
    M{announcements empty\nafter filter?}
    N[Show no announcements message]
    O[Render announcement list\ntitle · date · message · type badge]
    P([User presses Escape or clicks overlay\nor clicks close button]):::trigger
    Q[Modal closes\nisOpen = false · body scroll restored]

    A --> B
    B -->|useAnnouncements| C
    C --> D
    D --> E
    E --> F
    F -- count > 0 --> G
    F -- count = 0 --> H
    G --> I
    I --> J
    J --> K
    K -- yes --> L
    K -- no --> M
    M -- empty --> N
    M -- has items --> O
    O --> P
    P --> Q

    classDef trigger  fill:#0d47a1,stroke:#42a5f5,color:#fff
    classDef db       fill:#bf360c,stroke:#ff8a65,color:#fff
    classDef external fill:#4a148c,stroke:#ce93d8,color:#fff
    classDef admin    fill:#1b5e20,stroke:#81c784,color:#fff
    classDef blocked  fill:#b71c1c,stroke:#ef9a9a,color:#fff
```

> **Note:** Expiry filtering (`expiresAt IS NULL OR expiresAt >= today`) is intentionally
> done client-side — Firestore cannot express a null-or-date composite filter without a
> fragile index. The collection is expected to stay under 100 documents.
