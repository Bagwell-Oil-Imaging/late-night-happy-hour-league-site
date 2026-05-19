---
feature: Announcements
type: component
generated: 2026-05-19
spec: ../../../features/announcements.md
---

```mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
    class App {
        <<component>>
        ~announcementsOpen: boolean
        ~openAnnouncements: () => void
        ~closeAnnouncements: () => void
    }

    class Header {
        <<component>>
        +onOpenAnnouncements: () => void
        +announcementsCount: number
        +onOpenBylaws: () => void
        ~menuOpen: boolean
        +useSeasonYear() string
    }

    class HamburgerMenu {
        <<component>>
        +isOpen: boolean
        +onToggle: () => void
    }

    class AnnouncementsModal {
        <<component>>
        +isOpen: boolean
        +onClose: () => void
        ~announcements: Announcement[]
        ~loading: boolean
        +useAnnouncements() Announcement[]
    }

    class SeasonContext {
        <<context>>
        +currentSeasonYear: string
    }

    SeasonContext ..> Header : provides seasonYear
    App --> Header : renders\npasses onOpenAnnouncements + count
    App --> AnnouncementsModal : renders\npasses isOpen + onClose
    Header --> HamburgerMenu : renders
```

> **Note:** `announcementsCount` is derived by the parent (`App` or the layout that mounts
> `Header`) from the same `useAnnouncements` hook result — the count is passed as a prop
> so `Header` itself does not call the hook. `AnnouncementsModal` calls `useAnnouncements`
> directly for the full announcement list and renders it.
