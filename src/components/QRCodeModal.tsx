/**
 * @file QRCodeModal.tsx
 * @module components/QRCodeModal
 *
 * Modal that displays a scannable QR code pointing at the public site URL,
 * with copy-to-clipboard and download-as-PNG actions.
 *
 * The QR code always encodes the production URL (not `window.location.origin`)
 * so a code generated while testing locally still points visitors at the real
 * site instead of localhost.
 */

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './QRCodeModal.css'

/** The public site URL encoded into the QR code — intentionally hardcoded, see file header. */
const SITE_URL = 'https://late-night-happy-hour-league-site.vercel.app/'

interface QRCodeModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean
  /** Callback invoked when the user requests the modal to close */
  onClose: () => void
}

/**
 * QRCodeModal — generates and displays a QR code for the site URL.
 *
 * QR modules are rendered black-on-white regardless of the site's dark theme
 * so the code stays reliably scannable across camera apps.
 *
 * @param isOpen  - Whether the modal should be rendered
 * @param onClose - Handler to call when the modal should be dismissed
 */
function QRCodeModal({ isOpen, onClose }: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  // Generate the QR code once when the modal opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setCopyStatus('idle')
    QRCode.toDataURL(SITE_URL, {
      width: 512,
      margin: 2,
      color: { dark: '#0f0f1a', light: '#ffffff' },
    })
      .then((url) => { if (!cancelled) setDataUrl(url) })
      .catch((err) => console.error('[QRCodeModal] Failed to generate QR code:', err))
    return () => { cancelled = true }
  }, [isOpen])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  // Allow Escape key to dismiss the modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  /**
   * Copies the QR code PNG to the clipboard as an image, so it can be pasted
   * directly into chat apps, documents, etc. Falls back to a brief error
   * message if the Clipboard API (or ClipboardItem) isn't available.
   */
  async function handleCopy() {
    if (!dataUrl) return
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (err) {
      console.error('[QRCodeModal] Copy to clipboard failed:', err)
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Scan to Visit the Site</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close QR code">
            ✕
          </button>
        </div>

        <div className="qr-modal-body">
          <div className="qr-code-frame">
            {dataUrl ? (
              <img src={dataUrl} alt={`QR code linking to ${SITE_URL}`} className="qr-code-image" />
            ) : (
              <div className="qr-code-loading">Generating…</div>
            )}
          </div>

          <p className="qr-code-url">{SITE_URL}</p>

          <div className="qr-code-actions">
            <button
              type="button"
              className="qr-action-btn"
              onClick={handleCopy}
              disabled={!dataUrl}
            >
              {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy Image'}
            </button>
            <a
              href={dataUrl ?? undefined}
              download="late-night-happy-hour-qr.png"
              className={`qr-action-btn qr-action-btn--primary${dataUrl ? '' : ' qr-action-btn--disabled'}`}
            >
              Download
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}

export default QRCodeModal
