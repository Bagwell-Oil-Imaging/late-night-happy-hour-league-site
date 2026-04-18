import { useState } from 'react'
import './ContactPage.css'

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

interface FormData {
  name: string
  email: string
  phone: string
  experience: string
  teamSize: string
  message: string
}

const EMPTY_FORM: FormData = {
  name: '',
  email: '',
  phone: '',
  experience: '',
  teamSize: '',
  message: '',
}

// Set VITE_FORMSPREE_ID in your .env file to your Formspree form ID.
// Create a free form at https://formspree.io — they'll forward submissions to your email.
const FORMSPREE_URL = import.meta.env.VITE_FORMSPREE_ID
  ? `https://formspree.io/f/${import.meta.env.VITE_FORMSPREE_ID}`
  : null

function ContactPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [status, setStatus] = useState<FormStatus>('idle')

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!FORMSPREE_URL) {
      // Fallback: open mailto if Formspree not configured
      const body = encodeURIComponent(
        `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\n` +
        `Experience: ${form.experience}\nBowlers: ${form.teamSize}\n\n${form.message}`
      )
      window.location.href = `mailto:bowllatenighthappyhour@gmail.com?subject=League Interest - ${encodeURIComponent(form.name)}&body=${body}`
      return
    }

    setStatus('submitting')
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...form, _subject: `League Interest — ${form.name}` }),
      })
      if (res.ok) {
        setStatus('success')
        setForm(EMPTY_FORM)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="contact-page">

      {/* ── Page header ── */}
      <div className="contact-page-header">
        <h2 className="section-title">Contact &amp; Join</h2>
        <p className="contact-intro">
          Interested in joining the Late Night Happy Hour Bowling League? Fill out the form
          below and we'll be in touch before the next season opens.
        </p>
      </div>

      <div className="contact-layout">

        {/* ── Left: league info ── */}
        <aside className="contact-info">

          <div className="info-card">
            <h3 className="info-card-title">Get in Touch</h3>
            <a className="email-link" href="mailto:bowllatenighthappyhour@gmail.com">
              <span className="email-icon">✉</span>
              bowllatenighthappyhour@gmail.com
            </a>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">Team Format</h3>
            <ul className="info-list">
              <li><span className="info-bullet">▸</span> 4 bowlers per team</li>
              <li><span className="info-bullet">▸</span> Thursday nights, weekly</li>
              <li><span className="info-bullet">▸</span> Season runs September – May</li>
              <li><span className="info-bullet">▸</span> 3-game series each week</li>
              <li><span className="info-bullet">▸</span> Handicap scoring based on entering average</li>
              <li><span className="info-bullet">▸</span> Up to 4 points per match (1 per game + series)</li>
              <li><span className="info-bullet">▸</span> Substitute bowlers allowed with advance notice</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">League Obligations</h3>
            <ul className="info-list">
              <li><span className="info-bullet">▸</span> Attend weekly or arrange a qualified substitute</li>
              <li><span className="info-bullet">▸</span> Maintain a minimum number of games bowled to establish an average</li>
              <li><span className="info-bullet">▸</span> Absent bowlers are scored at 2/3 of their entering average</li>
              <li><span className="info-bullet">▸</span> Team captains are responsible for lineup submission</li>
              <li><span className="info-bullet">▸</span> All bowlers must conduct themselves in a respectful, sportsmanlike manner</li>
              <li><span className="info-bullet">▸</span> Disputes are resolved by league officers; their decision is final</li>
            </ul>
          </div>

          <div className="info-card info-card-dues">
            <h3 className="info-card-title">Dues &amp; Fees</h3>
            <ul className="info-list">
              <li><span className="info-bullet">▸</span> Weekly lineage fee collected each session</li>
              <li><span className="info-bullet">▸</span> Prize fund contribution included in weekly fee</li>
              <li><span className="info-bullet">▸</span> End-of-season banquet fee assessed separately</li>
            </ul>
            <p className="dues-disclaimer">
              ⚠ League dues, lineage, and all associated fees are subject to change
              for the upcoming season. Final amounts will be communicated before the
              season kick-off meeting.
            </p>
          </div>

          <div className="info-card info-card-bylaws">
            <p className="bylaws-note">
              The above is a summary. For the complete rulebook, download the full
              <button
                className="inline-link"
                onClick={() => window.open('/Bowling League Rules 2025.pdf', '_blank')}
              >
                2025 Bylaws (PDF)
              </button>.
            </p>
          </div>

        </aside>

        {/* ── Right: interest form ── */}
        <div className="contact-form-panel">
          <h3 className="form-panel-title">Express Interest</h3>

          {status === 'success' ? (
            <div className="form-success">
              <div className="success-icon">🎳</div>
              <h4 className="success-heading">We got your message!</h4>
              <p className="success-body">
                Thanks for your interest in the league. We'll reach out to you at the
                email you provided before the next season opens.
              </p>
              <button className="btn-secondary" onClick={() => setStatus('idle')}>
                Send Another
              </button>
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="cf-name">Full Name <span className="required">*</span></label>
                  <input
                    id="cf-name"
                    className="form-input"
                    type="text"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Your name"
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="cf-email">Email Address <span className="required">*</span></label>
                  <input
                    id="cf-email"
                    className="form-input"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="cf-phone">Phone (optional)</label>
                  <input
                    id="cf-phone"
                    className="form-input"
                    type="tel"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="(555) 555-5555"
                    autoComplete="tel"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="cf-experience">Bowling Experience <span className="required">*</span></label>
                  <select
                    id="cf-experience"
                    className="form-select"
                    value={form.experience}
                    onChange={set('experience')}
                    required
                  >
                    <option value="" disabled>Select level…</option>
                    <option value="Never bowled">Never bowled</option>
                    <option value="Casual / recreational">Casual / recreational</option>
                    <option value="League experience">League experience</option>
                    <option value="Competitive bowler">Competitive bowler</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cf-team-size">
                  How many bowlers are you bringing? <span className="required">*</span>
                </label>
                <select
                  id="cf-team-size"
                  className="form-select"
                  value={form.teamSize}
                  onChange={set('teamSize')}
                  required
                >
                  <option value="" disabled>Select…</option>
                  <option value="Just me (1)">Just me — looking to join a team</option>
                  <option value="2 bowlers">2 bowlers</option>
                  <option value="3 bowlers">3 bowlers</option>
                  <option value="Full team (4)">Full team of 4</option>
                  <option value="More than 4">More than 4 (multiple teams)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cf-message">Anything else we should know?</label>
                <textarea
                  id="cf-message"
                  className="form-textarea"
                  value={form.message}
                  onChange={set('message')}
                  placeholder="Questions, team name ideas, scheduling notes…"
                  rows={4}
                />
              </div>

              {status === 'error' && (
                <p className="form-error">Something went wrong. Try emailing us directly at bowllatenighthappyhour@gmail.com.</p>
              )}

              <button
                className="btn-submit"
                type="submit"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? 'Sending…' : 'Send Message →'}
              </button>

              {!FORMSPREE_URL && (
                <p className="form-hint">
                  Submitting will open your default email client. To enable direct sending, add your Formspree ID to <code>.env</code>.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ContactPage
