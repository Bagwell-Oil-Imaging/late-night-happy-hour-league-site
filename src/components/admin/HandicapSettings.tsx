import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useLeagueConfig } from '../../hooks'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'
import { DEFAULT_HANDICAP_PROFILE } from '../../utils/handicap'
import type { HandicapProfileType } from '../../types'

const TYPE_LABELS: Record<HandicapProfileType, string> = {
  teamDifference: 'Team Difference',
  basisScore: 'Basis Score',
}

const TYPE_DESCRIPTIONS: Record<HandicapProfileType, string> = {
  teamDifference: 'Percentage of the difference between the two teams’ summed active-bowler averages, awarded to the lower-average team.',
  basisScore: 'Each active bowler gets (Value − their average) × Percentage added to their score, clamped at 0. The team’s handicap is the sum of its bowlers’ adjustments.',
}

function HandicapSettings({ seasonYear }: { seasonYear: string }) {
  const { data: config, loading } = useLeagueConfig(seasonYear)
  const [type, setType] = useState<HandicapProfileType>(DEFAULT_HANDICAP_PROFILE.type)
  const [percentage, setPercentage] = useState(String(DEFAULT_HANDICAP_PROFILE.percentage * 100))
  const [value, setValue] = useState('220')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const profile = config?.handicapProfile ?? DEFAULT_HANDICAP_PROFILE
    setType(profile.type)
    setPercentage(String(profile.percentage * 100))
    setValue(String(profile.value ?? 220))
  }, [config?.handicapProfile, seasonYear])

  async function save() {
    const pct = Number(percentage)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setMessage('Enter a percentage from 1 to 100.')
      return
    }
    const val = Number(value)
    if (type === 'basisScore' && (!Number.isInteger(val) || val <= 0)) {
      setMessage('Enter a whole-number basis value greater than 0.')
      return
    }

    const handicapProfile = type === 'basisScore'
      ? { type, percentage: pct / 100, value: val }
      : { type, percentage: pct / 100 }

    setSaving(true)
    setMessage('')
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-handicap-profile', seasonYear, handicapProfile })
      } else {
        await setDoc(doc(db, 'leagueConfig', seasonYear), { handicapProfile }, { merge: true })
      }
      setMessage(`Handicap formula set to ${TYPE_LABELS[type]}.`)
    } catch (error) {
      console.error('[HandicapSettings] save:', error)
      setMessage('Failed to save handicap settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid rgba(201,168,76,0.18)', borderRadius: '8px', background: 'rgba(201,168,76,0.04)' }}>
      <h3 className="admin-form-section-title" style={{ margin: '0 0 0.35rem' }}>Handicap</h3>
      <p className="admin-form-hint" style={{ margin: '0 0 0.8rem' }}>{TYPE_DESCRIPTIONS[type]}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <label htmlFor="handicap-type" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Formula</label>
        <select
          id="handicap-type"
          className="admin-input"
          value={type}
          onChange={event => setType(event.target.value as HandicapProfileType)}
          style={{ width: 'auto' }}
        >
          {(Object.keys(TYPE_LABELS) as HandicapProfileType[]).map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <label htmlFor="handicap-percentage" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Percentage</label>
        <input
          id="handicap-percentage"
          className="admin-input"
          type="number"
          min="1"
          max="100"
          step="1"
          value={percentage}
          onChange={event => setPercentage(event.target.value)}
          style={{ width: '5rem' }}
        />

        {type === 'basisScore' && (
          <>
            <label htmlFor="handicap-value" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Basis value</label>
            <input
              id="handicap-value"
              className="admin-input"
              type="number"
              min="1"
              step="1"
              value={value}
              onChange={event => setValue(event.target.value)}
              style={{ width: '5.5rem' }}
            />
          </>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          style={{ background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '6px', color: '#c9a84c', padding: '0.6rem 0.85rem', minHeight: '2.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving || loading ? 0.5 : 1, letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          {saving ? 'Saving…' : 'Save handicap'}
        </button>
        {message && <span role="alert" style={{ color: message.startsWith('Failed') || message.startsWith('Enter') ? '#fca5a5' : '#4ade80', fontSize: '0.75rem' }}>{message}</span>}
      </div>
    </div>
  )
}

export default HandicapSettings
