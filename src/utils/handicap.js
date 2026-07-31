/**
 * @file handicap.js
 *
 * Single source of truth for the league's handicap formula. Consumed by
 * the transform pipeline (scripts/transform-data.js), the reingest endpoint
 * (api/reingest-week.js), and the admin data-correction UI
 * (src/pages/admin/DataCorrectionAdmin.tsx) — plain JS/JSDoc so it loads
 * unmodified under both Node ESM (scripts, serverless) and Vite/TS (src).
 *
 * The formula is driven by `LeagueConfig.handicapProfile` so a season can pick
 * its own type and parameters (the league adjusts this year over year)
 * without changing code. Seasons with no `handicapProfile` field fall back to
 * Team Difference @ 85%, which has been the formula since the pipeline
 * existed.
 *
 * Profile types:
 *  - "teamDifference" — percentage of the difference between the two teams'
 *    floored summed active-bowler averages, awarded to the lower-average team.
 *  - "basisScore" — each active bowler gets their own adjustment of
 *    max(0, floor((value - bowlerAvg) * percentage)); the team's handicap
 *    is the sum of its bowlers' individual adjustments. Unlike
 *    teamDifference, this doesn't depend on the opponent at all.
 *
 * Handicap is computed independently for each of the 3 games, not once for
 * the whole week — a team's active bowlers (and therefore its average) can
 * differ from game to game, so callers invoke calculateGameHandicap() once
 * per game with that game's own team/opponent averages.
 */

/** @type {import('../types').HandicapProfile} */
export const DEFAULT_HANDICAP_PROFILE = { type: 'teamDifference', percentage: 0.85 }

/**
 * One bowler's handicap adjustment for a single game under the "basisScore"
 * formula. Clamped at 0 — a bowler averaging above `profile.value` gets no
 * adjustment, never a penalty against their team.
 *
 * @param {number} bowlerAvg
 * @param {import('../types').HandicapProfile} profile
 * @returns {number}
 */
export function calculateBowlerHandicap(bowlerAvg, profile) {
  const value = profile.value ?? 0
  const pct = profile.percentage ?? DEFAULT_HANDICAP_PROFILE.percentage
  return Math.max(0, Math.floor((value - bowlerAvg) * pct))
}

/**
 * Computes one team's handicap for a single game, per the season's active
 * handicapProfile. Call once per game (with that game's own active-bowler
 * data) and once per side (with the two teams' figures swapped) to get all
 * six values for a matchup.
 *
 * @param {object} team
 * @param {number} team.teamAvg - Sum of this team's bowlers active for this specific game. Required by "teamDifference".
 * @param {number} team.opponentAvg - Sum of the opponent's bowlers active for this specific game. Required by "teamDifference".
 * @param {number[]} [team.bowlerAverages] - Averages of this team's bowlers active for this specific game. Required by "basisScore"; ignored by "teamDifference".
 * @param {Partial<import('../types').LeagueConfig>} [leagueConfig] - Season config; missing/undefined handicapProfile falls back to the league default.
 * @returns {number}
 */
export function calculateGameHandicap({ teamAvg, opponentAvg, bowlerAverages }, leagueConfig = {}) {
  const profile = leagueConfig.handicapProfile ?? DEFAULT_HANDICAP_PROFILE

  switch (profile.type) {
    case 'teamDifference': {
      const pct = profile.percentage ?? DEFAULT_HANDICAP_PROFILE.percentage
      const flooredTeamAvg = Math.floor(teamAvg)
      const flooredOpponentAvg = Math.floor(opponentAvg)
      return Math.max(0, Math.floor((flooredOpponentAvg - flooredTeamAvg) * pct))
    }
    case 'basisScore': {
      return (bowlerAverages ?? []).reduce((sum, avg) => sum + calculateBowlerHandicap(avg, profile), 0)
    }
    default:
      throw new Error(`Unknown handicap profile type "${profile.type}"`)
  }
}
