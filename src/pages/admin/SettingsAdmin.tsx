/**
 * @file SettingsAdmin.tsx
 * @module pages/admin/SettingsAdmin
 *
 * Admin panel for site-wide settings.
 *
 * Currently manages the active season year, which controls which Firestore
 * collection documents are shown across the entire public site. Changing this
 * value takes effect immediately for all visitors via the Firestore real-time
 * listener in SeasonContext.
 *
 * The setting is stored in `settings/global` in Firestore:
 *   { currentSeasonYear: '2025-2026' }
 *
 * Available season options are derived from the `seasons` Firestore collection
 * so the dropdown stays in sync with whatever seasons have been seeded/imported.
 */

import { useState, useEffect } from 'react'
import { doc, setDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { useDocument } from '../../hooks/useFirestore'
import { useSeasons, useScheduleWeeks, useLeagueConfig } from '../../hooks'
import type { AppSettings } from '../../context/SeasonContext'
import type { ScheduleWeek } from '../../types'
import SeasonScheduleBuilder from './SeasonScheduleBuilder'
import { isScheduleWeekVisible } from '../../utils/weekVisibility'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'
import '../admin/AnnouncementsAdmin.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Per-status visual tokens for the dark admin theme.
 * rowBg / rowBorderColor drive row-level distinction so status
 * is communicated by the entire row, not just a pill.
 */
const STATUS_CONFIG: Record<ScheduleWeek['status'], {
  label: string
  dot: string
  textColor: string
  rowBg: string | undefined
  rowBorderColor: string
}> = {
  completed: {
    label: 'Completed',
    dot: '#4ade80',
    textColor: '#4ade80',
    rowBg: 'rgba(74, 222, 128, 0.04)',
    rowBorderColor: '#166534',
  },
  upcoming: {
    label: 'Upcoming',
    dot: '#60a5fa',
    textColor: '#60a5fa',
    rowBg: undefined,
    rowBorderColor: 'transparent',
  },
  skip: {
    label: 'Skip',
    dot: '#6b7280',
    textColor: '#6b7280',
    rowBg: 'rgba(0, 0, 0, 0.25)',
    rowBorderColor: '#374151',
  },
}

/**
 * Formats a YYYY-MM-DD date string into a readable label using LOCAL time.
 * Without the local-time constructor, browsers in UTC-N timezones render
 * "2025-09-04" as the previous day (Sep 3) because Date() parses bare ISO
 * dates as midnight UTC, not midnight local.
 */
function formatWeekDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * Builds a human-readable notes string from a ScheduleWeek's metadata flags.
 * Position-round flag leads, followed by event name, then skip reason, so the
 * most bowling-significant label appears first.
 *
 * @param week - The ScheduleWeek document to derive notes from
 * @returns Pipe-delimited notes string, or empty string if none apply
 */
function buildWeekNotes(week: ScheduleWeek): string {
  const parts: string[] = []
  if (week.positionRound) parts.push('Position Round')
  if (week.event) parts.push(week.event)
  if (week.skipReason) parts.push(week.skipReason)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// SettingsAdmin
// ---------------------------------------------------------------------------

/**
 * Admin page for managing global site settings.
 *
 * Loads the current `settings/global` document and the list of available
 * seasons. Lets the admin pick a season from a dropdown and save it, which
 * immediately updates the active season across the entire public site.
 */
function SettingsAdmin() {
  const { data: settings, loading: settingsLoading } = useDocument<AppSettings>('settings', 'global')
  const { data: seasons, loading: seasonsLoading } = useSeasons()

  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [error, setError] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState('')
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [visibilityMsg, setVisibilityMsg] = useState('')

  // Load schedule weeks and league config for the currently *selected* season so the
  // admin can preview any season's details before saving the active-season change.
  const { data: scheduleWeeks, loading: weeksLoading } = useScheduleWeeks(selected)
  const { data: leagueConfig, loading: configLoading } = useLeagueConfig(selected || null)

  // Sync local state once Firestore settings load
  useEffect(() => {
    if (settings?.currentSeasonYear) {
      setSelected(settings.currentSeasonYear)
    }
  }, [settings])

  const isLoading = settingsLoading || seasonsLoading
  const isDirty = selected !== (settings?.currentSeasonYear ?? '')
  const authRequiredMessage = 'Failed to update week visibility: Firebase admin sign-in is required.'

  /**
   * Writes the selected season year to `settings/global`.
   * Uses `setDoc` with `merge: true` so other future settings fields are preserved.
   */
  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError('')
    setSavedMsg('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-active-season', seasonYear: selected })
      } else {
        await setDoc(doc(db, 'settings', 'global'), { currentSeasonYear: selected }, { merge: true })
      }
      setSavedMsg(`Active season updated to ${selected}`)
    } catch (err) {
      setError('Failed to save settings. Please try again.')
      console.error('[SettingsAdmin] setDoc error:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleWeekVisibilityChange(week: ScheduleWeek, visible: boolean) {
    if (!isLocalAdminBypass() && !auth.currentUser) {
      setVisibilityMsg(authRequiredMessage)
      return
    }
    setVisibilitySaving(true)
    setVisibilityMsg('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-week-visibility', updates: [{ date: week.date, visible }] })
      } else {
        await setDoc(doc(db, 'scheduleWeeks', week.date), { visible }, { merge: true })
      }
      setVisibilityMsg(`${week.week == null ? formatWeekDate(week.date) : `Week ${week.week}`} is now ${visible ? 'visible' : 'hidden'}.`)
    } catch (err) {
      setVisibilityMsg('Failed to update week visibility. Please try again.')
      console.error('[SettingsAdmin] visibility update error:', err)
    } finally {
      setVisibilitySaving(false)
    }
  }

  async function handleBatchVisibility(weeks: ScheduleWeek[], visible: boolean, label: string) {
    if (weeks.length === 0) return
    if (!isLocalAdminBypass() && !auth.currentUser) {
      setVisibilityMsg(authRequiredMessage)
      return
    }
    setVisibilitySaving(true)
    setVisibilityMsg('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({
          operation: 'set-week-visibility',
          updates: weeks.map(week => ({ date: week.date, visible })),
        })
      } else {
        const batch = writeBatch(db)
        weeks.forEach(week => {
          batch.set(doc(db, 'scheduleWeeks', week.date), { visible }, { merge: true })
        })
        await batch.commit()
      setVisibilityMsg(`${label} ${visible ? 'shown' : 'hidden'}.`)
      }
    } catch (err) {
      setVisibilityMsg('Failed to update week visibility. Please try again.')
      console.error('[SettingsAdmin] batch visibility update error:', err)
    } finally {
      setVisibilitySaving(false)
    }
  }
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Site Settings</h1>
      </div>

      <div className="admin-form-card">
        {/* ── Header row: title + live active-season badge ──────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <h2 className="admin-form-section-title" style={{ margin: 0 }}>Active Season</h2>
          {!isLoading && settings?.currentSeasonYear && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(74,222,128,0.09)',
              border: '1px solid rgba(74,222,128,0.22)',
              borderRadius: '6px',
              padding: '0.3rem 0.7rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#4ade80',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#4ade80', flexShrink: 0 }} />
              {settings.currentSeasonYear}
            </span>
          )}
        </div>

        <p style={{ margin: '0 0 1.1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
          Controls which season's data is shown site-wide — standings, matchups, stats, awards, and schedule.
          Changes take effect immediately for all visitors.
        </p>

        {isLoading ? (
          <p className="admin-loading">Loading settings…</p>
        ) : (
          /* ── Selector + save inline ──────────────────────────────────── */
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <select
                id="season-select"
                className="admin-input"
                value={selected}
                style={{ width: '100%' }}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setSavedMsg('')
                  setShowBuilder(false)
                  setScheduleMsg('')
                  setVisibilityMsg('')
                }}
              >
                {seasons.length === 0 && (
                  <option value="" disabled>No seasons available</option>
                )}
                {seasons.map((s) => (
                  <option key={s.year} value={s.year}>{s.year}</option>
                ))}
              </select>
              {/* Pending-change indicator dot on the selector */}
              {isDirty && (
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  right: '2rem',
                  transform: 'translateY(-50%)',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#c9a84c',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty || !selected}
              style={{
                flexShrink: 0,
                background: isDirty && !saving
                  ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)'
                  : 'rgba(201,168,76,0.12)',
                border: 'none',
                borderRadius: '6px',
                color: isDirty && !saving ? '#0f0f1a' : 'rgba(201,168,76,0.35)',
                padding: '0 1.25rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: isDirty && !saving ? 'pointer' : 'default',
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {/* Feedback messages */}
        {savedMsg && (
          <p className="admin-success-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{savedMsg}</p>
        )}
        {error && (
          <p className="admin-error-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {selected && (
        <div className="admin-form-card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 className="admin-form-section-title" style={{ margin: '0 0 0.2rem' }}>Season Details</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.02em' }}>
                {selected}
                {selected !== (settings?.currentSeasonYear ?? '') && (
                  <span style={{ marginLeft: '0.5rem', color: '#c9a84c', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>preview</span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={visibilitySaving || weeksLoading || scheduleWeeks.length === 0}
                onClick={() => handleBatchVisibility(scheduleWeeks.filter(w => w.week != null), true, 'All bowling weeks')}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(201,168,76,0.4)',
                  borderRadius: '6px',
                  color: '#c9a84c',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: visibilitySaving || weeksLoading || scheduleWeeks.length === 0 ? 'default' : 'pointer',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Show All
              </button>
              <button
                type="button"
                disabled={visibilitySaving || weeksLoading || scheduleWeeks.length === 0}
                onClick={() => handleBatchVisibility(scheduleWeeks.filter(w => w.week != null && w.week >= 1 && w.week <= 16), false, 'Weeks 1-16')}
                style={{
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.35)',
                  borderRadius: '6px',
                  color: '#fca5a5',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: visibilitySaving || weeksLoading || scheduleWeeks.length === 0 ? 'default' : 'pointer',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Hide Weeks 1-16
              </button>
            </div>
          </div>

          <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
            Use the Public column in the schedule below to control what visitors can see. Hidden weeks stay editable in admin tools but are omitted from public schedule, matchup navigation, and homepage week selection.
          </p>

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {/* ── Schedule ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h3 className="admin-form-section-title" style={{ margin: 0 }}>Schedule</h3>
            </div>
            {!showBuilder && !weeksLoading && !configLoading && (
              <button
                type="button"
                onClick={() => { setShowBuilder(true); setScheduleMsg('') }}
                style={{
                  flexShrink: 0,
                  background: scheduleWeeks.length === 0
                    ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)'
                    : 'transparent',
                  border: scheduleWeeks.length === 0
                    ? 'none'
                    : '1px solid rgba(201,168,76,0.4)',
                  borderRadius: '6px',
                  color: scheduleWeeks.length === 0 ? '#0f0f1a' : '#c9a84c',
                  padding: '0.45rem 1rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {scheduleWeeks.length === 0 ? '+ Set Up Schedule' : '✎ Edit Schedule'}
              </button>
            )}
          </div>

          {scheduleMsg && (
            <p className="admin-success-msg" style={{ marginBottom: '1rem' }}>{scheduleMsg}</p>
          )}
          {visibilityMsg && (
            <p className={visibilityMsg.startsWith('Failed') ? 'admin-error-msg' : 'admin-success-msg'} style={{ marginBottom: '1rem' }}>{visibilityMsg}</p>
          )}

          {/* ── Builder mode ──────────────────────────────────────────────── */}
          {showBuilder ? (
            <>
              <p className="admin-form-hint" style={{ marginBottom: '1.25rem', borderLeft: '2px solid rgba(201,168,76,0.35)', paddingLeft: '0.75rem' }}>
                {scheduleWeeks.length === 0
                  ? `Setting up the schedule for ${selected}.`
                  : `Editing the schedule for ${selected}.`}
                {' '}Holiday/skip weeks don't count toward the total — the season extends by one date at the end for each one you add.
              </p>
              <SeasonScheduleBuilder
                key={selected}
                seasonYear={selected}
                existingWeeks={scheduleWeeks}
                configuredTotalWeeks={leagueConfig?.totalWeeks}
                onSaved={() => {
                  setShowBuilder(false)
                  setScheduleMsg(`Schedule saved for ${selected}.`)
                }}
                onCancel={() => setShowBuilder(false)}
              />
            </>

          ) : (
            /* ── View mode ───────────────────────────────────────────────── */
            <>
              {weeksLoading || configLoading ? (
                <p className="admin-loading">Loading schedule…</p>
              ) : scheduleWeeks.length === 0 ? (
                <p className="admin-form-hint">No schedule data for this season yet.</p>
              ) : (() => {
                const bowlingCount = scheduleWeeks.filter(w => w.week !== null).length
                return (
                  <>
                    {/* ── Stat chips ─────────────────────────────────────── */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                      {[
                        { value: bowlingCount, label: 'Bowling Weeks' },
                        ...(leagueConfig?.totalWeeks != null
                          ? [{ value: leagueConfig.totalWeeks, label: 'Configured' }]
                          : []),
                        { value: scheduleWeeks.length, label: 'Calendar Entries' },
                      ].map(stat => (
                        <div
                          key={stat.label}
                          style={{
                            background: 'rgba(201,168,76,0.07)',
                            border: '1px solid rgba(201,168,76,0.18)',
                            borderRadius: '8px',
                            padding: '0.55rem 1rem',
                            minWidth: '80px',
                          }}
                        >
                          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c9a84c', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {stat.value}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                            {stat.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Week table ─────────────────────────────────────── */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            {(['Wk', 'Date', 'Status', 'Notes', 'Public'] as const).map((col) => (
                              <th
                                key={col}
                                style={{
                                  padding: '0.4rem 0.875rem',
                                  fontWeight: 600,
                                  fontSize: '0.62rem',
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase',
                                  color: 'rgba(255,255,255,0.3)',
                                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                                  textAlign: col === 'Public' ? 'right' : 'left',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleWeeks.map((week) => {
                            const cfg = STATUS_CONFIG[week.status]
                            const notes = buildWeekNotes(week)
                            const isSkip = week.status === 'skip'
                            const isVisible = isScheduleWeekVisible(week)
                            return (
                              <tr
                                key={week.date}
                                style={{
                                  borderBottom: '1px solid rgba(255,255,255,0.045)',
                                  borderLeft: `3px solid ${cfg.rowBorderColor}`,
                                  backgroundColor: cfg.rowBg,
                                  opacity: isVisible ? (isSkip ? 0.55 : 1) : 0.45,
                                }}
                              >
                                {/* Week number — gold anchor for bowling weeks */}
                                <td style={{
                                  padding: '0.6rem 0.875rem',
                                  verticalAlign: 'middle',
                                  width: '3.5rem',
                                  fontSize: week.week !== null ? '1rem' : '0.85rem',
                                  fontWeight: week.week !== null ? 700 : 400,
                                  color: week.week !== null ? '#c9a84c' : 'rgba(255,255,255,0.2)',
                                  fontVariantNumeric: 'tabular-nums',
                                  letterSpacing: '-0.01em',
                                }}>
                                  {week.week ?? '—'}
                                </td>

                                {/* Date */}
                                <td style={{
                                  padding: '0.6rem 0.875rem',
                                  verticalAlign: 'middle',
                                  color: isSkip ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)',
                                  fontStyle: isSkip ? 'italic' : undefined,
                                }}>
                                  {formatWeekDate(week.date)}
                                </td>

                                {/* Status — dot + label, not a dominant pill */}
                                <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', width: '7rem' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: cfg.textColor,
                                  }}>
                                    <span style={{
                                      width: '5px',
                                      height: '5px',
                                      borderRadius: '50%',
                                      backgroundColor: cfg.dot,
                                      flexShrink: 0,
                                    }} />
                                    {cfg.label}
                                  </span>
                                </td>

                                {/* Notes */}
                                <td style={{
                                  padding: '0.6rem 0.875rem',
                                  verticalAlign: 'middle',
                                  color: 'rgba(255,255,255,0.35)',
                                  fontSize: '0.8rem',
                                }}>
                                  {notes || <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>}
                                </td>
                                <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', textAlign: 'right' }}>
                                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', color: isVisible ? '#4ade80' : 'rgba(255,255,255,0.35)', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: visibilitySaving ? 'default' : 'pointer' }}>
                                    <span>{isVisible ? 'Visible' : 'Hidden'}</span>
                                    <input
                                      type="checkbox"
                                      checked={isVisible}
                                      disabled={visibilitySaving}
                                      onChange={(event) => handleWeekVisibilityChange(week, event.target.checked)}
                                      style={{ width: '18px', height: '18px', accentColor: '#c9a84c', cursor: visibilitySaving ? 'default' : 'pointer' }}
                                    />
                                  </label>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()}
            </>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsAdmin
