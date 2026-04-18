import './WeekSelector.css'

interface WeekEntry {
  week: number
  date: string
}

interface WeekSelectorProps {
  week: number
  minWeek: number
  maxWeek: number
  date?: string
  weeks?: WeekEntry[]
  onPrev: () => void
  onNext: () => void
  onJump?: (week: number) => void
}

function WeekSelector({ week, minWeek, maxWeek, date, weeks, onPrev, onNext, onJump }: WeekSelectorProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return ''
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="week-selector">
      <button
        className="week-btn"
        onClick={onPrev}
        disabled={week <= minWeek}
        aria-label="Previous week"
      >
        ←
      </button>

      {weeks && onJump ? (
        <select
          className="week-jump-select"
          value={week}
          onChange={e => onJump(parseInt(e.target.value, 10))}
          aria-label="Jump to week"
        >
          {weeks.map(w => (
            <option key={w.week} value={w.week}>
              Week {w.week} — {formatDate(w.date)}
            </option>
          ))}
        </select>
      ) : (
        <div className="week-label">
          <span className="week-number">Week {week}</span>
          {date && <span className="week-date">{formatDate(date)}</span>}
        </div>
      )}

      <button
        className="week-btn"
        onClick={onNext}
        disabled={week >= maxWeek}
        aria-label="Next week"
      >
        →
      </button>
    </div>
  )
}

export default WeekSelector
