/**
 * @file index.ts
 * @module types
 *
 * TypeScript interface definitions for every Firestore collection in the
 * Late Night Happy Hour Bowling League site.
 *
 * Each interface maps 1-to-1 with a Firestore collection document shape.
 * Optional `id?: string` fields hold the Firestore document ID when a
 * document is read back from the database.
 *
 * Breaking changes from the pre-migration schema:
 *  - `BowlerStat` and embedded `BowlerWeek` removed; replaced by standalone `BowlerScore`
 *  - `TeamDetail` (with `g1/g2/g3`) removed; replaced by `TeamSummary` (with `game1Total/…`)
 *  - `Matchup.team1Score` / `team2Score` → `team1ScratchScore` / `team2ScratchScore`
 *  - `CarouselImage.image` → `imageUrl`
 *  - `Season.champion: string` → `championTeamId: string | null` + `championTeamName: string | null`
 *  - `ScheduleWeek.dataWeek` removed; `positionRound: boolean` added
 *  - `Announcement` gains `pinned` and `expiresAt`
 */

/** LeagueConfig — one document per season storing all business rules */
export interface LeagueConfig {
  seasonYear: string;
  leagueName: string;
  leagueType: string;
  weekday: string;
  startTime: string;
  bowlingCenter: string;
  sanctionNumber: number;
  numTeams: number;
  bowlersPerTeam: number;
  gamesPerNight: number;
  totalWeeks: number;
  numLanes: number;
  /** Handicap percentage, e.g. 0.85 for 85% */
  handicapPct: number;
  handicapBase: number;
  /** Fraction of average used for blind score */
  blindScorePct: number;
  minGamesForAvg: number;
  prevSeasonMinGames: number;
  positionRoundSchedule: string;
  dues: number;
  lineage: number;
  entryFee: number;
  leaguePalsId: string;
}

/** Team — one document per team per season */
export interface Team {
  id?: string;
  leaguePalsId: string;
  /** When true, this document was created via the admin Data Correction panel
   *  and must not be overwritten by the automated data pipeline. */
  adminOverride?: boolean;
  displayId: number;
  seasonYear: string;
  name: string;
  captainName: string;
  captainBowlerId: string | null;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  pointsWon: number;
  pointsLost: number;
  pctWon: number;
  average: number;
  scratchPins: number;
  totalPins: number;
  highGame: number;
}

/** Bowler — one document per bowler per season */
export interface Bowler {
  id?: string;
  leaguePalsId: string;
  /** When true, this document was created or edited via the admin Data Correction panel
   *  and must not be overwritten by the automated data pipeline. */
  adminOverride?: boolean;
  seasonYear: string;
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  name: string;
  avatarUrl: string | null;
  average: number;
  averageFloat: number;
  enteringAvg: number;
  enteringAvgSeason: string;
  highGame: number;
  highGameHdcp: number;
  highSeries: number;
  highSeriesHdcp: number;
  gamesPlayed: number;
  blindWeeksTotal: number;
  blindWeeksRow: number;
  indPointsWon: number;
}

/** BowlerScore — one document per bowler per week (fact table) */
export interface BowlerScore {
  id?: string;
  /** When true, this document was created or edited via the admin Data Correction panel
   *  and must not be overwritten by the automated data pipeline. */
  adminOverride?: boolean;
  bowlerId: string;
  bowlerName: string;
  teamId: string;
  teamName: string;
  opponentTeamId: string;
  opponentTeamName: string;
  matchupId: string;
  seasonYear: string;
  week: number;
  date: string;
  actualBowlDate: string | null;
  lanePair: number;
  /** null when bowler was absent/blinded */
  game1: number | null;
  game2: number | null;
  game3: number | null;
  series: number | null;
  preBowled: boolean;
  blinded: boolean;
  isSubstitute: boolean;
  substituteFor: string | null;
  /** Running season average through this week (floor of total scratch pins ÷ total games, blind weeks excluded). null before first game. */
  rollingAvg: number | null;
  /** Total non-blind games bowled through this week — denominator for rollingAvg. */
  rollingGames: number;
}

/** Matchup — one document per scheduled matchup */
export interface Matchup {
  id?: string;
  leaguePalsMatchId: string;
  seasonYear: string;
  week: number;
  date: string;
  team1Id: string;
  team2Id: string;
  team1Lane: number;
  team2Lane: number;
  team1ScratchScore: number | null;
  team2ScratchScore: number | null;
  positionRound: boolean;
  completed: boolean;
}

/** TeamSummary — team aggregate data inside a MatchupDetail */
export interface TeamSummary {
  teamId: string;
  teamName: string;
  lane: number;
  teamAvg: number;
  game1Total: number;
  game2Total: number;
  game3Total: number;
  scratchSeries: number;
  handicapPerGame: number;
  handicapSeries: number;
  totalSeries: number;
  points: number;
  /**
   * When true, only team-level game totals were recorded for this week.
   * Individual bowler scores are not available and should be shown as `*`
   * in public-facing views. Set by the admin Data Correction panel when
   * entering team totals without per-bowler breakdown.
   */
  individualScoresUnavailable?: boolean;
}

/** MatchupDetail — team-level aggregate for a completed matchup */
export interface MatchupDetail {
  id?: string;
  /** When true, this document was corrected via the admin Data Correction panel
   *  and must not be overwritten by the automated data pipeline. */
  adminOverride?: boolean;
  matchupId: string;
  seasonYear: string;
  week: number;
  date: string;
  team1: TeamSummary;
  team2: TeamSummary;
}

/** ScheduleWeek — one document per calendar date in the season */
export interface ScheduleWeek {
  id?: string;
  week: number | null;
  date: string;
  seasonYear: string;
  status: 'completed' | 'upcoming' | 'skip';
  positionRound: boolean;
  skipReason: string | null;
  event: string | null;
}

/** SeasonTeam — snapshot of a team's final standings within a Season */
export interface SeasonTeam {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
}

/** Season — season metadata and final standings snapshot */
export interface Season {
  id?: string;
  year: string;
  startDate: string;
  endDate: string;
  championTeamId: string | null;
  championTeamName: string | null;
  teams: SeasonTeam[];
}

/**
 * DocumentSource — discriminated union for document content type.
 *
 * When `type` is 'text', `content` holds Markdown and `driveFileId` is null.
 * When `type` is 'pdf', `driveFileId` holds the Google Drive file ID and
 * `content` is null. Use `driveFileUrl(driveFileId)` or
 * `driveDownloadUrl(driveFileId)` from `src/utils/drive.ts` to produce a URL.
 *
 * Firebase Storage (`fileUrl`) was removed in phase-5/sub-task-1. All PDFs
 * are now served from Google Drive via `driveFileId`.
 */
export interface DocumentSource {
  type: 'text' | 'pdf';
  /** Markdown content when type == 'text', null otherwise */
  content: string | null;
  /**
   * Google Drive file ID when type == 'pdf', null otherwise.
   *
   * Pass this value to `driveFileUrl(fileId)` or `driveDownloadUrl(fileId)`
   * from `src/utils/drive.ts` to produce a usable URL.
   */
  driveFileId: string | null;
}

/** LeagueDocument — versioned bylaws PDF per season */
export interface LeagueDocument {
  id?: string;
  title: string;
  type: 'bylaws';
  version: string;
  seasonYear: string | null;
  effectiveDate: string;
  active: boolean;
  source: DocumentSource;
  createdAt: string;
  updatedAt: string;
}

/** Announcement — admin-managed announcement with optional expiry and pinning */
export interface Announcement {
  id?: string;
  title: string;
  message: string;
  date: string;
  type: 'reminder' | 'event' | 'info';
  priority: 'low' | 'normal' | 'high';
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Event — admin-managed league event */
export interface Event {
  id?: string;
  title: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  location: string;
  type: 'regular' | 'tournament' | 'social' | 'banquet';
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** CarouselImage — admin-managed hero carousel image */
export interface CarouselImage {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  alt: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
