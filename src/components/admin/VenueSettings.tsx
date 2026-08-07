import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useLeagueConfig } from '../../hooks'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'

/**
 * Admin editor for the bowling center name and street address on a season's
 * `leagueConfig` document. The address populates the Google Maps embed shown
 * on the off-season landing page (`LeagueMap`, rendered via `OffSeasonLanding`).
 */
function VenueSettings({ seasonYear }: { seasonYear: string }) {
  const { data: config, loading } = useLeagueConfig(seasonYear)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setName(config?.bowlingCenter ?? '')
    setAddress(config?.bowlingCenterAddress ?? '')
  }, [config?.bowlingCenter, config?.bowlingCenterAddress, seasonYear])

  async function save() {
    if (!name.trim()) {
      setMessage('Enter a bowling center name.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const payload = { bowlingCenter: name.trim(), bowlingCenterAddress: address.trim() }
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'set-venue', seasonYear, ...payload })
      } else {
        await setDoc(doc(db, 'leagueConfig', seasonYear), payload, { merge: true })
      }
      setMessage('Venue saved.')
    } catch (error) {
      console.error('[VenueSettings] save:', error)
      setMessage('Failed to save venue. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid rgba(201,168,76,0.18)', borderRadius: '8px', background: 'rgba(201,168,76,0.04)' }}>
      <h3 className="admin-form-section-title" style={{ margin: '0 0 0.35rem' }}>Venue</h3>
      <p className="admin-form-hint" style={{ margin: '0 0 0.8rem' }}>
        The street address shows a Google Maps embed on the off-season landing page while this season is upcoming.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label htmlFor="venue-name" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '6rem' }}>Center name</label>
          <input id="venue-name" className="admin-input" type="text" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Playdrome Bowling Lanes" style={{ flex: 1, minWidth: '200px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label htmlFor="venue-address" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '6rem' }}>Address</label>
          <input id="venue-address" className="admin-input" type="text" value={address} onChange={event => setAddress(event.target.value)} placeholder="e.g. 1536 Kings Hwy N, Cherry Hill Township, NJ 08034" style={{ flex: 1, minWidth: '200px' }} />
        </div>
        <div>
          <button type="button" onClick={save} disabled={saving || loading} style={{ background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '6px', color: '#c9a84c', padding: '0.6rem 0.85rem', minHeight: '2.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving || loading ? 0.5 : 1, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {saving ? 'Saving…' : 'Save venue'}
          </button>
          {message && <span role="alert" style={{ marginLeft: '0.65rem', color: message.startsWith('Failed') || message.startsWith('Enter') ? '#fca5a5' : '#4ade80', fontSize: '0.75rem' }}>{message}</span>}
        </div>
      </div>
    </div>
  )
}

export default VenueSettings
