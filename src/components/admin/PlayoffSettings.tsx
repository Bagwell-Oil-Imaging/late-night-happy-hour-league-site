import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useLeagueConfig } from '../../hooks'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'

function PlayoffSettings({ seasonYear }: { seasonYear: string }) {
  const { data: config, loading } = useLeagueConfig(seasonYear)
  const [count, setCount] = useState('8')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => setCount(String(config?.playoffTeamCount ?? 8)), [config?.playoffTeamCount, seasonYear])

  async function save() {
    const playoffTeamCount = Number(count)
    if (!Number.isInteger(playoffTeamCount) || playoffTeamCount < 2 || playoffTeamCount > 8) {
      setMessage('Enter a whole number from 2 to 8.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-playoff-team-count', seasonYear, playoffTeamCount })
      } else {
        await setDoc(doc(db, 'leagueConfig', seasonYear), { playoffTeamCount }, { merge: true })
      }
      setMessage(`Playoff field set to ${playoffTeamCount} teams.`)
    } catch (error) {
      console.error('[PlayoffSettings] save:', error)
      setMessage('Failed to save playoff settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid rgba(201,168,76,0.18)', borderRadius: '8px', background: 'rgba(201,168,76,0.04)' }}>
      <h3 className="admin-form-section-title" style={{ margin: '0 0 0.35rem' }}>Playoffs</h3>
      <p className="admin-form-hint" style={{ margin: '0 0 0.8rem' }}>Single elimination across Weeks 14–16 and 30–32. Smaller fields receive first-round byes.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <label htmlFor="playoff-team-count" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Teams qualifying per half</label>
        <input id="playoff-team-count" className="admin-input" type="number" min="2" max="8" step="1" value={count} onChange={event => setCount(event.target.value)} aria-describedby="playoff-settings-message" aria-invalid={message.startsWith('Enter')} style={{ width: '5rem' }} />
        <button type="button" onClick={save} disabled={saving || loading} style={{ background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '6px', color: '#c9a84c', padding: '0.6rem 0.85rem', minHeight: '2.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving || loading ? 0.5 : 1, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {saving ? 'Saving…' : 'Save playoffs'}
        </button>
        {message && <span id="playoff-settings-message" role="alert" style={{ color: message.startsWith('Failed') || message.startsWith('Enter') ? '#fca5a5' : '#4ade80', fontSize: '0.75rem' }}>{message}</span>}
      </div>
    </div>
  )
}

export default PlayoffSettings
