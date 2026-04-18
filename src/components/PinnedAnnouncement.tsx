/**
 * @file PinnedAnnouncement.tsx
 * @module components/PinnedAnnouncement
 *
 * Renders a single pinned announcement banner at the top of the page.
 * Fetches announcements from Firestore via `useAnnouncements` and finds
 * the first item with `pinned === true`. Renders nothing if no pinned
 * announcement exists or while data is loading.
 *
 * The hook returns items sorted pinned-first, so `announcements[0]` is
 * the most prominent pinned item when one exists.
 */

import { useAnnouncements } from '../hooks'
import './PinnedAnnouncement.css'

/**
 * Returns an emoji icon representing announcement priority level.
 *
 * @param priority - Priority string: "high" | "normal" | "low"
 * @returns Emoji character appropriate for the priority
 */
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'high':   return '⚠️'
    case 'normal': return '📢'
    case 'low':    return 'ℹ️'
    default:       return '📢'
  }
}

/**
 * PinnedAnnouncement — banner showing the first pinned announcement.
 *
 * Renders nothing (not even a placeholder) when:
 * - Data is still loading
 * - No announcement has `pinned === true`
 *
 * This keeps the layout clean when no pinned content is available.
 */
function PinnedAnnouncement() {
  const { data: announcements, loading } = useAnnouncements()

  // Do not render anything while loading to avoid layout shift
  if (loading) return null

  // The hook sorts pinned items first; find the first explicitly pinned one
  const pinnedAnnouncement = announcements.find((a) => a.pinned === true)

  // Render nothing if no pinned announcement exists
  if (!pinnedAnnouncement) return null

  return (
    <div className={`pinned-announcement priority-${pinnedAnnouncement.priority}`}>
      <div className="pinned-announcement-content">
        <span className="pinned-icon">{getPriorityIcon(pinnedAnnouncement.priority)}</span>
        <div className="pinned-text">
          <strong className="pinned-title">{pinnedAnnouncement.title}:</strong>
          <span className="pinned-message">{pinnedAnnouncement.message}</span>
        </div>
      </div>
    </div>
  )
}

export default PinnedAnnouncement
