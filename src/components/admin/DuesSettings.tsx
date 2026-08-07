import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useLeagueConfig } from '../../hooks'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'

/**
 * Admin editor for weekly dues on a season's `leagueConfig` document.
 *
 * `bowlersPerTeam` is the active lineup size — how many bowlers play (and owe
 * dues) each week — not the full roster, which can carry extra bench/sub-pool
 * bowlers who don't bowl every week. `lineage` is the per-bowler weekly dues
 * amount. Team total = bowlersPerTeam × lineage, shown on the public Season
 * Schedule page via the dues indicator on each play week.
 */
function DuesSettings({ seasonYear }: { seasonYear: string }) {
  const { data: config, loading } = useLeagueConfig(seasonYear)
  const [bowlersPerTeam, setBowlersPerTeam] = useState('4')
  const [lineage, setLineage] = useState('0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setBowlersPerTeam(String(config?.bowlersPerTeam ?? 4))
    setLineage(String(config?.lineage ?? 0))
  }, [config?.bowlersPerTeam, config?.lineage, seasonYear])

  async function save() {
    const parsedLineup = parseInt(bowlersPerTeam, 10)
    const parsedLineage = parseFloat(lineage)
    if (!Number.isInteger(parsedLineup) || parsedLineup < 1 || parsedLineup > 10) {
      setMessage('Bowlers per team must be a whole number from 1 to 10.')
      return
    }
    if (!Number.isFinite(parsedLineage) || parsedLineage < 0) {
      setMessage('Weekly dues per bowler must be a positive number.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-dues', seasonYear, bowlersPerTeam: parsedLineup, lineage: parsedLineage })
      } else {
        await setDoc(doc(db, 'leagueConfig', seasonYear), { bowlersPerTeam: parsedLineup, lineage: parsedLineage }, { merge: true })
      }
      setMessage('Dues saved.')
    } catch (error) {
      console.error('[DuesSettings] save:', error)
      setMessage('Failed to save dues. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const teamTotal = Number.isFinite(parseFloat(lineage)) ? parseInt(bowlersPerTeam, 10) * parseFloat(lineage) : null

  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid rgba(201,168,76,0.18)', borderRadius: '8px', background: 'rgba(201,168,76,0.04)' }}>
      <h3 className="admin-form-section-title" style={{ margin: '0 0 0.35rem' }}>Dues</h3>
      <p className="admin-form-hint" style={{ margin: '0 0 0.8rem' }}>
        Only the active lineup owes dues each week — bench/sub-pool bowlers on an extended roster don't count. Shown to visitors as a $ indicator on each play week in the Season Schedule.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label htmlFor="dues-lineup-size" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '10rem' }}>Bowlers per team (lineup)</label>
          <input id="dues-lineup-size" className="admin-input" type="number" min={1} max={10} value={bowlersPerTeam} onChange={event => setBowlersPerTeam(event.target.value)} style={{ width: '80px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label htmlFor="dues-lineage" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '10rem' }}>Weekly dues per bowler ($)</label>
          <input id="dues-lineage" className="admin-input" type="number" min={0} step="0.01" value={lineage} onChange={event => setLineage(event.target.value)} style={{ width: '80px' }} />
        </div>
        {teamTotal !== null && (
          <p className="admin-form-hint" style={{ margin: 0 }}>
            Team owes ${teamTotal} per week.
          </p>
        )}
        <div>
          <button type="button" onClick={save} disabled={saving || loading} style={{ background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '6px', color: '#c9a84c', padding: '0.6rem 0.85rem', minHeight: '2.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving || loading ? 0.5 : 1, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {saving ? 'Saving…' : 'Save dues'}
          </button>
          {message && <span role="alert" style={{ marginLeft: '0.65rem', color: message.startsWith('Failed') || message.startsWith('Bowlers') || message.startsWith('Weekly') ? '#fca5a5' : '#4ade80', fontSize: '0.75rem' }}>{message}</span>}
        </div>
      </div>
    </div>
  )
}

export default DuesSettings
