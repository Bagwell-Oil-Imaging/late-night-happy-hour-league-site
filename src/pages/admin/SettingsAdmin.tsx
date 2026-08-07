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

import { useState, useEffect, useMemo } from 'react'
import { doc, setDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { useDocument } from '../../hooks/useFirestore'
import { useSeasons, useScheduleWeeks, useLeagueConfig } from '../../hooks'
import type { AppSettings } from '../../context/SeasonContext'
import type { ScheduleWeek } from '../../types'
import SeasonScheduleBuilder from './SeasonScheduleBuilder'
import { isScheduleWeekVisible } from '../../utils/weekVisibility'
import PlayoffSettings from '../../components/admin/PlayoffSettings'
import HandicapSettings from '../../components/admin/HandicapSettings'
import VenueSettings from '../../components/admin/VenueSettings'
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

/**
 * Total-weeks options offered when staging a new season. Matches
 * SeasonScheduleBuilder's own default (32) plus a realistic surrounding range.
 */
const NEW_SEASON_TOTAL_WEEKS_OPTIONS = Array.from({ length: 21 }, (_, i) => 20 + i)
const NEW_SEASON_DEFAULT_TOTAL_WEEKS = 32

/**
 * Generates the next `count` valid, non-overlapping season-year strings that
 * follow on from the most recent existing season (each season's end year is
 * the next season's start year — no gaps, no overlaps). Falls back to the
 * current calendar year when no seasons exist yet.
 *
 * @param seasons - Season list from useSeasons(), sorted year desc
 * @param count    - Number of sequential candidates to generate
 */
function getNextSeasonCandidates(seasons: { year: string }[], count = 3): string[] {
  const latestStartYear = seasons[0]?.year ? parseInt(seasons[0].year.split('-')[0], 10) : null
  const baseStartYear = latestStartYear != null ? latestStartYear + 1 : new Date().getFullYear()
  return Array.from({ length: count }, (_, i) => `${baseStartYear + i}-${baseStartYear + i + 1}`)
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
  const [seasonActive, setSeasonActive] = useState(true)
  const [upcomingSeasonYear, setUpcomingSeasonYear] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [statusError, setStatusError] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState('')
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [visibilityMsg, setVisibilityMsg] = useState('')
  const [showCreateSeason, setShowCreateSeason] = useState(false)
  const [newSeasonYear, setNewSeasonYear] = useState('')
  const [newSeasonTotalWeeks, setNewSeasonTotalWeeks] = useState(String(NEW_SEASON_DEFAULT_TOTAL_WEEKS))
  const [creatingSeason, setCreatingSeason] = useState(false)
  const [createSeasonMsg, setCreateSeasonMsg] = useState('')
  const [createSeasonError, setCreateSeasonError] = useState('')

  // Load schedule weeks and league config for the currently *selected* season so the
  // admin can preview any season's details before saving the active-season change.
  const { data: scheduleWeeks, loading: weeksLoading } = useScheduleWeeks(selected)
  const { data: leagueConfig, loading: configLoading } = useLeagueConfig(selected || null)

  // Sequential, non-overlapping season-year options for the Create Season selector —
  // recomputed whenever the seasons list changes so it always follows the latest one.
  const newSeasonCandidates = useMemo(() => getNextSeasonCandidates(seasons), [seasons])

  // Sync local state once Firestore settings load
  useEffect(() => {
    if (settings?.currentSeasonYear) {
      setSelected(settings.currentSeasonYear)
    }
  }, [settings])

  // Sync season-status local state once Firestore settings load
  useEffect(() => {
    if (settings) {
      setSeasonActive(settings.seasonActive ?? true)
      setUpcomingSeasonYear(settings.upcomingSeasonYear ?? '')
    }
  }, [settings])

  const isLoading = settingsLoading || seasonsLoading
  const isDirty = selected !== (settings?.currentSeasonYear ?? '')
  const authRequiredMessage = 'Failed to update week visibility: Firebase admin sign-in is required.'
  const isSeasonYearFormat = (value: string) => /^\d{4}-\d{4}$/.test(value)
  const isStatusDirty =
    seasonActive !== (settings?.seasonActive ?? true)
    || upcomingSeasonYear !== (settings?.upcomingSeasonYear ?? '')

  /**
   * Creates `seasons/{year}` and `leagueConfig/{year}` documents for a brand-new
   * season so it can be staged (scheduled, previewed) before the LeaguePals
   * import pipeline ever targets it. LeagueConfig fields mirror the pipeline's
   * own no-API-data fallback defaults (scripts/transform-data.js
   * populateLeagueConfig) so a staged season behaves identically to one the
   * pipeline creates from scratch once it eventually runs for this year.
   */
  async function handleCreateSeason() {
    setCreateSeasonError('')
    setCreateSeasonMsg('')

    const year = newSeasonYear
    if (!year) {
      setCreateSeasonError('Select a season year.')
      return
    }
    // Defensive only — the selector only ever offers sequential, non-overlapping
    // years, so this should not be reachable in normal use.
    if (seasons.some((s) => s.year === year)) {
      setCreateSeasonError(`Season ${year} already exists.`)
      return
    }
    const totalWeeks = parseInt(newSeasonTotalWeeks, 10)
    if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 52) {
      setCreateSeasonError('Total weeks must be a number from 1 to 52.')
      return
    }

    setCreatingSeason(true)
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'create-season', seasonYear: year, totalWeeks })
      } else {
        if (!auth.currentUser) throw new Error('Firebase admin sign-in is required.')
        const batch = writeBatch(db)
        batch.set(doc(db, 'seasons', year), {
          year,
          startDate: '',
          endDate: '',
          championTeamId: null,
          championTeamName: null,
          teams: [],
        })
        batch.set(doc(db, 'leagueConfig', year), {
          seasonYear: year,
          leagueName: 'Late Night Happy Hour Bowling League',
          leagueType: 'Mens',
          weekday: 'Thursday',
          startTime: '8:20 PM',
          bowlingCenter: 'Unknown',
          sanctionNumber: 0,
          numTeams: 13,
          bowlersPerTeam: 4,
          gamesPerNight: 3,
          totalWeeks,
          playoffTeamCount: 8,
          numLanes: 26,
          handicapProfile: { type: 'teamDifference', percentage: 0.85 },
          blindScorePct: 0.9,
          minGamesForAvg: 3,
          prevSeasonMinGames: 21,
          positionRoundSchedule: 'Every other night',
          dues: 0,
          lineage: 0,
          entryFee: 0,
          leaguePalsId: '',
        })
        await batch.commit()
      }
      setCreateSeasonMsg(`Season ${year} created — select it below to build its schedule.`)
      setSelected(year)
      setNewSeasonYear('')
      setNewSeasonTotalWeeks(String(NEW_SEASON_DEFAULT_TOTAL_WEEKS))
      setShowCreateSeason(false)
    } catch (err) {
      setCreateSeasonError(err instanceof Error ? err.message : 'Failed to create season. Please try again.')
      console.error('[SettingsAdmin] create-season error:', err)
    } finally {
      setCreatingSeason(false)
    }
  }

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

  /**
   * Writes the between-seasons status to `settings/global`: whether the
   * league is currently active, and which season year the public landing
   * page should count down to when it isn't.
   */
  async function handleSaveStatus() {
    setStatusError('')
    setStatusMsg('')
    const trimmedUpcoming = upcomingSeasonYear.trim()
    if (!seasonActive && trimmedUpcoming && !isSeasonYearFormat(trimmedUpcoming)) {
      setStatusError('Upcoming season must be in YYYY-YYYY format, e.g. 2026-2027.')
      return
    }
    setStatusSaving(true)
    try {
      const payload = {
        seasonActive,
        upcomingSeasonYear: seasonActive ? null : (trimmedUpcoming || null),
      }
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-season-status', ...payload })
      } else {
        await setDoc(doc(db, 'settings', 'global'), payload, { merge: true })
      }
      setStatusMsg(seasonActive ? 'League marked as in-season.' : 'League marked as between seasons.')
    } catch (err) {
      setStatusError('Failed to save season status. Please try again.')
      console.error('[SettingsAdmin] season status setDoc error:', err)
    } finally {
      setStatusSaving(false)
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

      {/* ── Create Season: stages a brand-new season's Firestore records ──── */}
      <div className="admin-form-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showCreateSeason ? '1rem' : 0 }}>
          <div>
            <h2 className="admin-form-section-title" style={{ margin: 0 }}>Create Season</h2>
            {!showCreateSeason && (
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)' }}>
                Stage a new season's records so you can build its schedule ahead of time.
              </p>
            )}
          </div>
          {!showCreateSeason && (
            <button
              type="button"
              onClick={() => {
                setShowCreateSeason(true)
                setCreateSeasonMsg('')
                setCreateSeasonError('')
                setNewSeasonYear(newSeasonCandidates[0] ?? '')
              }}
              style={{
                flexShrink: 0,
                background: 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)',
                border: 'none',
                borderRadius: '6px',
                color: '#0f0f1a',
                padding: '0.5rem 1rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              + New Season
            </button>
          )}
        </div>

        {showCreateSeason && (
          <>
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
              Creates <code>seasons</code> and <code>leagueConfig</code> documents with sensible
              defaults (matching what the LeaguePals import pipeline would use on its own first
              run). Build the week-by-week schedule for it under Season Details below once created.
            </p>
            <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="new-season-year" style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                  Season Year
                </label>
                <select
                  id="new-season-year"
                  className="admin-input"
                  style={{ width: '100%' }}
                  value={newSeasonYear}
                  onChange={(e) => setNewSeasonYear(e.target.value)}
                >
                  {newSeasonCandidates.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '0 1 120px' }}>
                <label htmlFor="new-season-weeks" style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                  Total Weeks
                </label>
                <select
                  id="new-season-weeks"
                  className="admin-input"
                  style={{ width: '100%' }}
                  value={newSeasonTotalWeeks}
                  onChange={(e) => setNewSeasonTotalWeeks(e.target.value)}
                >
                  {NEW_SEASON_TOTAL_WEEKS_OPTIONS.map((weeks) => (
                    <option key={weeks} value={weeks}>{weeks}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={handleCreateSeason}
                disabled={creatingSeason || !newSeasonYear.trim()}
                style={{
                  background: !creatingSeason && newSeasonYear.trim()
                    ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)'
                    : 'rgba(201,168,76,0.12)',
                  border: 'none',
                  borderRadius: '6px',
                  color: !creatingSeason && newSeasonYear.trim() ? '#0f0f1a' : 'rgba(201,168,76,0.35)',
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: !creatingSeason && newSeasonYear.trim() ? 'pointer' : 'default',
                }}
              >
                {creatingSeason ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateSeason(false); setNewSeasonYear(''); setCreateSeasonError('') }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.55)',
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {createSeasonMsg && (
          <p className="admin-success-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{createSeasonMsg}</p>
        )}
        {createSeasonError && (
          <p className="admin-error-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{createSeasonError}</p>
        )}
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

      {/* ── Season Status: toggles the public between-seasons landing page ── */}
      <div className="admin-form-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="admin-form-section-title" style={{ margin: '0 0 0.4rem' }}>Season Status</h2>
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
          When marked "Between Seasons," the homepage swaps its dashboard for a landing view
          promoting the league interest form and a link to season history, with a countdown to
          Week 1 of the upcoming season (pulled from that season's schedule).
        </p>

        {isLoading ? (
          <p className="admin-loading">Loading settings…</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: upcomingSeasonYear || !seasonActive ? '1rem' : 0 }}>
              <button
                type="button"
                onClick={() => setSeasonActive(true)}
                style={{
                  flex: 1,
                  background: seasonActive ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)' : 'transparent',
                  border: seasonActive ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  color: seasonActive ? '#0f0f1a' : 'rgba(255,255,255,0.55)',
                  padding: '0.55rem 1rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                In Season
              </button>
              <button
                type="button"
                onClick={() => setSeasonActive(false)}
                style={{
                  flex: 1,
                  background: !seasonActive ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)' : 'transparent',
                  border: !seasonActive ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  color: !seasonActive ? '#0f0f1a' : 'rgba(255,255,255,0.55)',
                  padding: '0.55rem 1rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Between Seasons
              </button>
            </div>

            {!seasonActive && (
              <div>
                <label htmlFor="upcoming-season" style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                  Upcoming Season (for countdown)
                </label>
                <input
                  id="upcoming-season"
                  className="admin-input"
                  style={{ width: '100%' }}
                  placeholder="e.g. 2026-2027"
                  value={upcomingSeasonYear}
                  onChange={(e) => setUpcomingSeasonYear(e.target.value)}
                />
                <p className="admin-form-hint" style={{ marginTop: '0.4rem' }}>
                  Countdown reads Week 1's date from that season's schedule. There is currently
                  no admin path to create a brand-new season's Firestore records (the LeaguePals
                  import pipeline is hardcoded to one season — see known issues), so this only
                  works today for a season year that already exists.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveStatus}
              disabled={statusSaving || !isStatusDirty}
              style={{
                marginTop: '1rem',
                background: isStatusDirty && !statusSaving
                  ? 'linear-gradient(135deg, #c9a84c 0%, #e8c96a 100%)'
                  : 'rgba(201,168,76,0.12)',
                border: 'none',
                borderRadius: '6px',
                color: isStatusDirty && !statusSaving ? '#0f0f1a' : 'rgba(201,168,76,0.35)',
                padding: '0.55rem 1.25rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: isStatusDirty && !statusSaving ? 'pointer' : 'default',
              }}
            >
              {statusSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}

        {statusMsg && (
          <p className="admin-success-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{statusMsg}</p>
        )}
        {statusError && (
          <p className="admin-error-msg" style={{ marginTop: '0.625rem', marginBottom: 0 }}>{statusError}</p>
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

          <PlayoffSettings seasonYear={selected} />
          <HandicapSettings seasonYear={selected} />
          <VenueSettings seasonYear={selected} />

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
