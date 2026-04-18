/**
 * @file index.ts
 * @module hooks
 *
 * Domain-specific React hooks for every Firestore collection in the Late Night
 * Happy Hour Bowling League site.
 *
 * Each hook wraps the generic `useCollection` / `useDocument` primitives from
 * `./useFirestore` with the correct collection name, query constraints, and
 * TypeScript type parameter. Application components should import from here
 * rather than using the generic hooks directly, so query logic stays in one
 * place.
 *
 * Available hooks:
 *  useTeams            – All teams for a season, sorted by points desc
 *  useTeam             – Single team by Firestore document ID (leaguePalsId)
 *  useBowlers          – All bowlers for a season, optionally by teamId
 *  useBowler           – Single bowler by Firestore document ID (leaguePalsId)
 *  useBowlerScores     – All scores for a bowler, optionally by season
 *  useMatchups         – All matchups for a season, optionally by week
 *  useMatchupDetails   – All matchup details for a season, optionally by week
 *  useMatchupDetail    – Single matchup detail by matchup document ID
 *  useScheduleWeeks    – All schedule weeks for a season, sorted by date
 *  useSeasons          – All seasons, sorted by year desc
 *  useSeason           – Single season by year string
 *  useLeagueConfig     – League config document for a season
 *  useAnnouncements    – Non-expired announcements, sorted pinned → priority → date
 *  useEvents           – All events, sorted by date asc
 *  useCarouselImages   – All carousel images, sorted by order asc
 *  useDocuments        – Active league documents by type and optional season
 *  useActiveDocument   – The single active document for a type+season combination
 */

import { where, orderBy } from 'firebase/firestore';
import { useCollection, useDocument } from './useFirestore';
import type {
  Team,
  Bowler,
  BowlerScore,
  Matchup,
  MatchupDetail,
  ScheduleWeek,
  Season,
  LeagueConfig,
  Announcement,
  Event,
  CarouselImage,
  LeagueDocument,
} from '../types';

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Subscribes to all teams for a given season year, ordered by points descending.
 * Useful for standings tables and team selectors.
 *
 * @param seasonYear - Four-digit season year string, e.g. `'2024'`
 * @returns `{ data: Team[], loading, error }`
 */
export function useTeams(seasonYear: string) {
  return useCollection<Team>('teams', [
    where('seasonYear', '==', seasonYear),
    orderBy('points', 'desc'),
  ]);
}

/**
 * Subscribes to a single team document identified by its Firestore document ID
 * (which equals the LeaguePals team ID used during seeding).
 *
 * @param leaguePalsId - Firestore document ID / LeaguePals ID, or null/undefined to skip
 * @returns `{ data: Team | null, loading, error }`
 */
export function useTeam(leaguePalsId: string | null | undefined) {
  return useDocument<Team>('teams', leaguePalsId ?? undefined);
}

// ---------------------------------------------------------------------------
// Bowlers
// ---------------------------------------------------------------------------

/**
 * Subscribes to all bowlers for a given season, optionally filtered to a
 * single team. When `teamId` is provided the query uses a compound filter
 * (seasonYear + teamId); otherwise only seasonYear is applied.
 *
 * @param seasonYear - Four-digit season year string
 * @param teamId     - Optional Firestore team document ID to narrow results
 * @returns `{ data: Bowler[], loading, error }`
 */
export function useBowlers(seasonYear: string, teamId?: string) {
  // Build constraints conditionally to avoid an unnecessary compound index
  // when the caller only needs all bowlers for a season
  const constraints = teamId
    ? [
        where('seasonYear', '==', seasonYear),
        where('teamId', '==', teamId),
      ]
    : [where('seasonYear', '==', seasonYear)];

  return useCollection<Bowler>('bowlers', constraints);
}

/**
 * Subscribes to a single bowler document by its Firestore document ID.
 *
 * @param leaguePalsId - Firestore document ID / LeaguePals bowler ID, or null/undefined to skip
 * @returns `{ data: Bowler | null, loading, error }`
 */
export function useBowler(leaguePalsId: string | null | undefined) {
  return useDocument<Bowler>('bowlers', leaguePalsId ?? undefined);
}

// ---------------------------------------------------------------------------
// Bowler Scores
// ---------------------------------------------------------------------------

/**
 * Subscribes to all `BowlerScore` documents for a given bowler, ordered by
 * week ascending. Optionally filters to a single season.
 *
 * @param bowlerId   - Firestore bowler document ID
 * @param seasonYear - Optional season year to narrow to a single season
 * @returns `{ data: BowlerScore[], loading, error }`
 */
export function useBowlerScores(bowlerId: string, seasonYear?: string) {
  const constraints = seasonYear
    ? [
        where('bowlerId', '==', bowlerId),
        where('seasonYear', '==', seasonYear),
        orderBy('week', 'asc'),
      ]
    : [where('bowlerId', '==', bowlerId), orderBy('week', 'asc')];

  return useCollection<BowlerScore>('bowlerScores', constraints);
}

// ---------------------------------------------------------------------------
// Matchups
// ---------------------------------------------------------------------------

/**
 * Subscribes to all matchups for a season. When `week` is provided the query
 * is narrowed to that specific week (useful for the weekly scorecard view).
 * Without `week`, results are ordered by week ascending.
 *
 * @param seasonYear - Four-digit season year string
 * @param week       - Optional week number to filter by
 * @returns `{ data: Matchup[], loading, error }`
 */
export function useMatchups(seasonYear: string, week?: number) {
  const constraints =
    week !== undefined
      ? [
          where('seasonYear', '==', seasonYear),
          where('week', '==', week),
        ]
      : [
          where('seasonYear', '==', seasonYear),
          orderBy('week', 'asc'),
        ];

  return useCollection<Matchup>('matchups', constraints);
}

/**
 * Subscribes to all `MatchupDetail` documents for a given season, optionally
 * filtered to a specific week. Results are ordered by week ascending.
 *
 * Useful for pages that need team-level aggregate scores across multiple weeks
 * (e.g. TeamsPage, MatchupsPage scoreboard).
 *
 * @param seasonYear - Four-digit season year string
 * @param week       - Optional week number to narrow results to a single week
 * @returns `{ data: MatchupDetail[], loading, error }`
 */
export function useMatchupDetails(seasonYear: string, week?: number) {
  const constraints =
    week !== undefined
      ? [
          where('seasonYear', '==', seasonYear),
          where('week', '==', week),
        ]
      : [
          where('seasonYear', '==', seasonYear),
          orderBy('week', 'asc'),
        ];

  return useCollection<MatchupDetail>('matchupDetails', constraints);
}

/**
 * Subscribes to a single `MatchupDetail` document by the parent matchup's
 * Firestore document ID.
 *
 * @param matchupId - Firestore matchup document ID, or null/undefined to skip
 * @returns `{ data: MatchupDetail | null, loading, error }`
 */
export function useMatchupDetail(matchupId: string | null | undefined) {
  return useDocument<MatchupDetail>('matchupDetails', matchupId ?? undefined);
}

// ---------------------------------------------------------------------------
// Schedule Weeks
// ---------------------------------------------------------------------------

/**
 * Subscribes to all schedule weeks for a season, ordered by date ascending.
 *
 * @param seasonYear - Four-digit season year string
 * @returns `{ data: ScheduleWeek[], loading, error }`
 */
export function useScheduleWeeks(seasonYear: string) {
  return useCollection<ScheduleWeek>('scheduleWeeks', [
    where('seasonYear', '==', seasonYear),
    orderBy('date', 'asc'),
  ]);
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/**
 * Subscribes to all season documents, sorted by year descending so the most
 * recent season is first.
 *
 * @returns `{ data: Season[], loading, error }`
 */
export function useSeasons() {
  return useCollection<Season>('seasons', [orderBy('year', 'desc')]);
}

/**
 * Subscribes to a single season document by year string (which is the
 * Firestore document ID for seasons).
 *
 * @param year - Four-digit year string, e.g. `'2024'`, or null/undefined to skip
 * @returns `{ data: Season | null, loading, error }`
 */
export function useSeason(year: string | null | undefined) {
  return useDocument<Season>('seasons', year ?? undefined);
}

// ---------------------------------------------------------------------------
// League Config
// ---------------------------------------------------------------------------

/**
 * Subscribes to the `LeagueConfig` document for a given season year.
 * The document ID in Firestore equals the season year string.
 *
 * @param seasonYear - Four-digit season year string, or null/undefined to skip
 * @returns `{ data: LeagueConfig | null, loading, error }`
 */
export function useLeagueConfig(seasonYear: string | null | undefined) {
  return useDocument<LeagueConfig>('leagueConfig', seasonYear ?? undefined);
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * Subscribes to all announcements and applies client-side filtering and sorting.
 *
 * Filtering rationale:
 *  Firestore cannot express "expiresAt IS NULL OR expiresAt >= today" in a single
 *  query without a composite index that is fragile to maintain. Fetching all
 *  announcements and filtering in JavaScript is simpler and the collection is
 *  expected to stay small (< 100 documents at any time).
 *
 * Sort order: pinned DESC → priority (high → normal → low) → date DESC
 *
 * @returns `{ data: Announcement[], loading, error }` — only non-expired items
 */
export function useAnnouncements() {
  // Fetch everything; expiry is cheap to filter in JS for a small collection
  const result = useCollection<Announcement>('announcements', []);

  // ISO date string for today, e.g. '2026-04-18' — used for expiry comparison
  const today = new Date().toISOString().split('T')[0];

  // Priority ranking used for stable sort (lower number = higher priority)
  const priorityOrder: Record<Announcement['priority'], number> = {
    high: 0,
    normal: 1,
    low: 2,
  };

  const filtered = result.data
    .filter(
      // Keep items that have no expiry date OR whose expiry is today or later
      (a) => !a.expiresAt || a.expiresAt >= today
    )
    .sort((a, b) => {
      // 1. Pinned items float to the top
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      // 2. Higher-priority items come next
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // 3. Most recent date first within the same priority
      return b.date.localeCompare(a.date);
    });

  return { ...result, data: filtered };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Subscribes to all league events, sorted by date ascending so the next
 * upcoming event is always first.
 *
 * @returns `{ data: Event[], loading, error }`
 */
export function useEvents() {
  return useCollection<Event>('events', [orderBy('date', 'asc')]);
}

// ---------------------------------------------------------------------------
// Carousel Images
// ---------------------------------------------------------------------------

/**
 * Subscribes to all hero carousel images, sorted by their `order` field
 * ascending so the display order matches the admin-assigned sequence.
 *
 * @returns `{ data: CarouselImage[], loading, error }`
 */
export function useCarouselImages() {
  return useCollection<CarouselImage>('carouselImages', [
    orderBy('order', 'asc'),
  ]);
}

// ---------------------------------------------------------------------------
// League Documents
// ---------------------------------------------------------------------------

/**
 * Subscribes to all active `LeagueDocument` records of a given type,
 * optionally filtered to a specific season.
 *
 * The `active == true` filter ensures only the current published version is
 * returned; superseded versions remain in Firestore for audit purposes but
 * are excluded here.
 *
 * @param type       - Document type discriminator (e.g. `'bylaws'`, `'rules'`)
 * @param seasonYear - Optional season year to narrow to season-specific documents
 * @returns `{ data: LeagueDocument[], loading, error }`
 */
export function useDocuments(type: string, seasonYear?: string) {
  const constraints = seasonYear
    ? [
        where('type', '==', type),
        where('seasonYear', '==', seasonYear),
        where('active', '==', true),
      ]
    : [where('type', '==', type), where('active', '==', true)];

  return useCollection<LeagueDocument>('documents', constraints);
}

/**
 * Convenience hook that returns the single active document for a given type
 * and season combination. Returns `null` when no matching document exists.
 *
 * Delegates to `useDocuments` so active-flag filtering is consistent.
 *
 * @param type       - Document type discriminator
 * @param seasonYear - Season year to scope the lookup
 * @returns `{ data: LeagueDocument | null, loading, error }`
 */
export function useActiveDocument(type: string, seasonYear: string) {
  const result = useDocuments(type, seasonYear);
  // Take the first element; Firestore ordering is deterministic via the active
  // filter, but there should logically be only one active document per type+season
  return { ...result, data: result.data[0] ?? null };
}

// ---------------------------------------------------------------------------
// Re-export generic hooks for consumers that need escape-hatch access
// ---------------------------------------------------------------------------

export { useCollection, useDocument } from './useFirestore';
