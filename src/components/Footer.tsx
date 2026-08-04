import { useSeasonYear } from '../context/SeasonContext'

/** Year the site launched — copyright line stays pinned here, doesn't track the season. */
const SITE_LAUNCH_YEAR = 2025

/**
 * Site-wide footer.
 *
 * Shows the active season (same admin-managed setting as the header) plus a
 * copyright line pinned to the site's launch year — the two are intentionally
 * independent so the copyright doesn't drift just because the season rolls over.
 */
function Footer() {
  const currentSeasonYear = useSeasonYear()

  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand">Late Night Happy Hour</span>
        <span className="footer-season">Season {currentSeasonYear}</span>
        <span className="footer-copy">&copy; {SITE_LAUNCH_YEAR} Bowling League &mdash; Thursday Nights</span>
      </div>
    </footer>
  )
}

export default Footer
