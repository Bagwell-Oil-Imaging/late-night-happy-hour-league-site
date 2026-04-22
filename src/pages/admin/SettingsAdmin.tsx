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
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDocument } from '../../hooks/useFirestore'
import { useSeasons } from '../../hooks'
import type { AppSettings } from '../../context/SeasonContext'
import '../admin/AnnouncementsAdmin.css'

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

  // Sync local state once Firestore settings load
  useEffect(() => {
    if (settings?.currentSeasonYear) {
      setSelected(settings.currentSeasonYear)
    }
  }, [settings])

  const isLoading = settingsLoading || seasonsLoading
  const isDirty = selected !== (settings?.currentSeasonYear ?? '')

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
      await setDoc(doc(db, 'settings', 'global'), { currentSeasonYear: selected }, { merge: true })
      setSavedMsg(`Active season updated to ${selected}`)
    } catch (err) {
      setError('Failed to save settings. Please try again.')
      console.error('[SettingsAdmin] setDoc error:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Site Settings</h1>
      </div>

      <div className="admin-form-card">
        <h2 className="admin-form-section-title">Active Season</h2>
        <p className="admin-form-hint">
          Controls which season's data is shown across the entire public site —
          standings, matchups, bowler stats, awards, and schedule. Changing this
          takes effect immediately for all visitors.
        </p>

        {isLoading ? (
          <p className="admin-loading">Loading settings…</p>
        ) : (
          <div className="admin-form-row">
            <label htmlFor="season-select" className="admin-label">
              Current Season
            </label>
            <select
              id="season-select"
              className="admin-input"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                setSavedMsg('')
              }}
            >
              {/* Fallback option when no seasons exist yet */}
              {seasons.length === 0 && (
                <option value="" disabled>No seasons available</option>
              )}
              {seasons.map((s) => (
                <option key={s.year} value={s.year}>
                  {s.year}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={handleSave}
              disabled={saving || !isDirty || !selected}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {savedMsg && <p className="admin-success-msg">{savedMsg}</p>}
        {error && <p className="admin-error-msg">{error}</p>}

        {!isLoading && settings?.currentSeasonYear && (
          <p className="admin-form-hint" style={{ marginTop: '0.5rem' }}>
            Currently active: <strong>{settings.currentSeasonYear}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

export default SettingsAdmin
