---
feature: Firestore Data Layer
type: flowchart
generated: 2026-05-19
spec: ../../../features/firestore-data-layer.md
---

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'edgeLabelBackground': '#1e1e2e', 'clusterBkg': '#252535', 'clusterBorder': '#4a4a6a'}}}%%
flowchart TD
    A([Component mounts]):::trigger
    B{docId or\ncollectionName\navailable?}
    C[Domain hook called\ne.g. useTeams, useBowlers]
    D{Sentinel constraint?\nbowlerId == __never__}
    E[Skip — no subscription\nopened]
    F[useCollection&lt;T&gt;\nor useDocument&lt;T&gt;]
    G[firebase.ts\ninitializeApp + db]:::trigger
    H[Build Firestore query\nonSnapshot listener opened]
    I[(Firestore Collection\nor Document)]:::db
    J[Snapshot arrives:\ndata injected with doc id]
    K[loading: false\ndata: T[] or T | null]
    L[Return data to component]
    M[Component unmounts\nunsubscribe called]
    N[Error captured\ninto error state]

    A --> C
    C --> D
    D -->|yes — skip| E
    D -->|no| F
    G --> F
    F --> B
    B -->|docId null/undefined| E
    B -->|valid| H
    H --> I
    I -->|real-time snapshot| J
    J --> K
    K --> L
    I -->|Firestore error| N
    N --> L
    L --> M

    classDef trigger  fill:#0d47a1,stroke:#42a5f5,color:#fff
    classDef db       fill:#bf360c,stroke:#ff8a65,color:#fff
    classDef external fill:#4a148c,stroke:#ce93d8,color:#fff
    classDef admin    fill:#1b5e20,stroke:#81c784,color:#fff
    classDef blocked  fill:#b71c1c,stroke:#ef9a9a,color:#fff
```
