/**
 * @file SeasonPlaceholder.tsx
 * @module components/SeasonPlaceholder
 *
 * Generic between-seasons placeholder shown on season-data pages (Standings,
 * Matchups, Schedule, Teams, Bowlers, Lanes) when `settings/global.seasonActive`
 * is false. Prevents stale data from a completed season being shown as if it
 * were current, and tells the user what the page will show once the season
 * starts.
 */

import { Link } from 'react-router-dom'
import './SeasonPlaceholder.css'

interface SeasonPlaceholderProps {
  /** Page name shown in the heading, e.g. "Standings". */
  pageTitle: string
  /** Sentence describing what populates this page once the season is active. Should complete "Once the season begins, ___". */
  whatYoullSee: string
}

function SeasonPlaceholder({ pageTitle, whatYoullSee }: SeasonPlaceholderProps) {
  return (
    <div className="season-placeholder">
      <span className="season-placeholder-eyebrow">Between Seasons</span>
      <h2 className="season-placeholder-title">{pageTitle}</h2>
      <p className="season-placeholder-body">
        The league hasn't started yet, so there's no {pageTitle.toLowerCase()} data to show.
      </p>
      <p className="season-placeholder-preview">
        <strong>Once the season begins:</strong> {whatYoullSee}
      </p>
      <Link to="/" className="season-placeholder-cta">
        ← Back to Home
      </Link>
    </div>
  )
}

export default SeasonPlaceholder
