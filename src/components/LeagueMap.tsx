/**
 * @file LeagueMap.tsx
 * @module components/LeagueMap
 *
 * Embeds a Google Maps location view for the bowling center address. Uses the
 * key-less Google Maps "output=embed" URL rather than the Maps Embed API, so
 * no API key or billing account is required — consistent with this project's
 * other third-party embeds (see `driveEmbedUrl` in `src/utils/drive.ts`).
 */

import './LeagueMap.css'

interface LeagueMapProps {
  /** Street address to center the map on, e.g. "1536 Kings Hwy N, Cherry Hill Township, NJ 08034". */
  address: string
  /** Optional label shown above the map (e.g. the bowling center's name). */
  label?: string
}

function LeagueMap({ address, label }: LeagueMapProps) {
  const src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`

  return (
    <div className="league-map">
      {label && <span className="league-map-label">{label}</span>}
      <div className="league-map-frame-wrap">
        <iframe
          src={src}
          title={label ? `Map of ${label}` : `Map of ${address}`}
          className="league-map-iframe"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="league-map-address"
      >
        {address}
      </a>
    </div>
  )
}

export default LeagueMap
