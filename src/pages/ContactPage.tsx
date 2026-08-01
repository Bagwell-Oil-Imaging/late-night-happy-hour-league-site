// ContactPage — shows league info sidebar and embeds a Google Form for league interest.
// No form state or async logic: the Google Forms iframe handles submission entirely.
import LeagueFormatInfo from '../components/LeagueFormatInfo'
import './ContactPage.css'

// The embedded Google Form URL for league interest submissions.
// All field validation, submission, and email delivery are handled by Google Forms.
const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSexNSK5RYx5bN1GbwLcjFwQidHfNz8KguspWBHX6ZT8eJo0YA/viewform?embedded=true'

/**
 * ContactPage
 *
 * Renders a two-column layout:
 *  - Left: league info sidebar (format, obligations, dues, bylaws link)
 *  - Right: Google Forms iframe embed for expressing league interest
 *
 * The page has no React state or async logic; the iframe handles everything.
 */
function ContactPage() {
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

          <LeagueFormatInfo />

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

        {/* ── Right: Google Forms iframe embed ── */}
        {/* Sizing is controlled entirely by the contact-iframe CSS class — no inline attributes. */}
        <div className="contact-form-panel">
          <h3 className="form-panel-title">Express Interest</h3>
          <iframe
            src={GOOGLE_FORM_URL}
            className="contact-iframe"
            title="League interest form"
            loading="lazy"
          >
            Loading…
          </iframe>
        </div>

      </div>
    </div>
  )
}

export default ContactPage
