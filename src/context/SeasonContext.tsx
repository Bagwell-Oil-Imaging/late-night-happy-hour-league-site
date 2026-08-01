/**
 * @file SeasonContext.tsx
 * @module context/SeasonContext
 *
 * Provides the active season year — and whether the league is currently
 * in-season — to the entire component tree via React Context.
 *
 * The value is sourced from the `settings/global` Firestore document, which the
 * admin panel can update at any time. All components that previously defined a
 * local `SEASON_YEAR` constant should use the `useSeasonYear()` hook from here
 * instead so the site-wide active season stays in sync with the admin setting.
 *
 * Fallback: if the Firestore document does not yet exist (e.g. a fresh Firestore
 * environment), the context defaults to `'2025-2026'` so the app remains usable
 * while an admin sets the value for the first time.
 */

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useDocument } from '../hooks/useFirestore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the `settings/global` Firestore document. */
export interface AppSettings {
  /** The currently active season year string, e.g. `'2025-2026'`. */
  currentSeasonYear: string
  /** False when the league is between seasons; missing/true means in-season. */
  seasonActive?: boolean
  /** Season year the site is counting down to while `seasonActive` is false. */
  upcomingSeasonYear?: string | null
}

interface SeasonContextValue {
  /** The active season year read from Firestore settings, or the fallback. */
  currentSeasonYear: string
  /** False when the league is between seasons; missing/undefined defaults to true. */
  seasonActive: boolean
  /** Season year to count down to while inactive, or null if not set. */
  upcomingSeasonYear: string | null
  /** True while the Firestore document is being fetched on initial load. */
  loading: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FALLBACK_SEASON = '2025-2026'

const SeasonContext = createContext<SeasonContextValue>({
  currentSeasonYear: FALLBACK_SEASON,
  seasonActive: true,
  upcomingSeasonYear: null,
  loading: false,
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Wraps the app and makes the active season year available via `useSeasonYear()`.
 *
 * Place this high in the component tree (e.g. inside `BrowserRouter` in main.tsx)
 * so every public and admin component can access the current season.
 *
 * @param children - Child components that can consume the season context.
 */
export function SeasonProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useDocument<AppSettings>('settings', 'global')

  return (
    <SeasonContext.Provider
      value={{
        currentSeasonYear: data?.currentSeasonYear ?? FALLBACK_SEASON,
        seasonActive: data?.seasonActive ?? true,
        upcomingSeasonYear: data?.upcomingSeasonYear ?? null,
        loading,
      }}
    >
      {children}
    </SeasonContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the currently active season year string (e.g. `'2025-2026'`).
 *
 * Must be used inside a component that is a descendant of `<SeasonProvider>`.
 * Returns the fallback value synchronously so components never receive undefined.
 *
 * @returns Active season year string.
 */
export function useSeasonYear(): string {
  return useContext(SeasonContext).currentSeasonYear
}

/**
 * Returns whether the league is currently in-season, plus the season year
 * being counted down to when it isn't.
 *
 * Used by HomePage to decide whether to render the normal dashboard or the
 * off-season landing view (interest form + history link + countdown).
 *
 * @returns `{ seasonActive, upcomingSeasonYear, loading }`
 */
export function useSeasonStatus(): { seasonActive: boolean; upcomingSeasonYear: string | null; loading: boolean } {
  const { seasonActive, upcomingSeasonYear, loading } = useContext(SeasonContext)
  return { seasonActive, upcomingSeasonYear, loading }
}
