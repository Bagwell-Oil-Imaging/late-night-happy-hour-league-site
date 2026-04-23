/**
 * @file DocumentsAdmin.tsx
 * @module pages/admin/DocumentsAdmin
 *
 * Simplified bylaws PDF admin panel.
 *
 * Versioning scheme: {season}.{revision} — e.g. "2025-2026.1", "2025-2026.2".
 * The revision auto-increments from existing docs for the selected season.
 * Every upload automatically becomes the active version for that season.
 *
 * Filename on Google Drive: League_Bylaws_{season}.{revision}.pdf
 */

import { useState } from 'react'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  orderBy,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { driveFileUrl } from '../../utils/drive'
import { useCollection } from '../../hooks/useFirestore'
import { useSeasons } from '../../hooks'
import type { LeagueDocument } from '../../types'
import { nowIso } from '../../utils/admin'
import './DocumentsAdmin.css'

// ── Version helpers ────────────────────────────────────────────────────────────

/**
 * Returns the next revision number for a given season.
 * Scans existing documents and increments the highest trailing revision digit.
 * Returns 1 if no documents exist for the season yet.
 *
 * @param docs       - All currently loaded documents.
 * @param seasonYear - Season to scope the revision count to.
 */
function nextRevision(docs: LeagueDocument[], seasonYear: string): number {
  const seasonDocs = docs.filter(d => d.seasonYear === seasonYear)
  if (seasonDocs.length === 0) return 1
  const max = Math.max(
    ...seasonDocs.map(d => {
      const match = d.version.match(/\.(\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
  )
  return max + 1
}

/** Formats the version string stored in Firestore: e.g. "2025-2026.1" */
function formatVersion(seasonYear: string, revision: number): string {
  return `${seasonYear}.${revision}`
}

/** Formats the Drive filename: e.g. "League_Bylaws_2025-2026.1.pdf" */
function driveFileName(seasonYear: string, revision: number): string {
  return `League_Bylaws_${seasonYear}.${revision}.pdf`
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * DocumentsAdmin component.
 *
 * The only user input is a season dropdown. Everything else is derived:
 *  - Version: auto-incremented from existing docs for that season.
 *  - Filename: League_Bylaws_{season}.{revision}.pdf
 *  - Active: every upload auto-activates and deactivates all previous for the season.
 *  - Title / effectiveDate: stored internally as derived values.
 *
 * @returns JSX element for the bylaws admin panel.
 */
function DocumentsAdmin() {
  const { data: documents, loading, error } = useCollection<LeagueDocument>(
    'documents',
    [orderBy('seasonYear', 'desc'), orderBy('effectiveDate', 'desc')]
  )
  const { data: seasons } = useSeasons()

  const [formOpen, setFormOpen] = useState(false)
  const [seasonYear, setSeasonYear] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Inline season-edit state ──────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSeason, setEditingSeason] = useState('')

  // ── Upload state ─────────────────────────────────────────────────────────
  const [uploadedDriveFileId, setUploadedDriveFileId] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ── Computed values ───────────────────────────────────────────────────────

  const revision = seasonYear ? nextRevision(documents, seasonYear) : 1
  const pendingVersion = seasonYear ? formatVersion(seasonYear, revision) : ''
  const pendingFileName = seasonYear ? driveFileName(seasonYear, revision) : ''

  // ── Form helpers ─────────────────────────────────────────────────────────

  function openNew() {
    setSeasonYear('')
    setUploadedDriveFileId(null)
    setUploadedFileName('')
    setUploadError(null)
    setIsDragging(false)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setSeasonYear('')
    setUploadedDriveFileId(null)
    setUploadedFileName('')
    setUploadError(null)
    setIsDragging(false)
  }

  // ── Immediate Drive upload ────────────────────────────────────────────────

  /**
   * Uploads the selected PDF to Google Drive immediately with the derived filename.
   * Season must be selected before this is callable (drop zone is disabled otherwise).
   *
   * @param file - The PDF file to upload.
   */
  async function handleFileSelected(file: File) {
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadedDriveFileId(null)
    setUploadedFileName('')

    try {
      const token = await auth.currentUser!.getIdToken()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folderId', import.meta.env.VITE_DRIVE_FOLDER_BYLAWS)
      formData.append('fileName', pendingFileName)

      const res = await fetch('/api/upload-to-drive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`)

      const { fileId } = await res.json()
      setUploadedDriveFileId(fileId)
      setUploadedFileName(pendingFileName)
    } catch (err) {
      console.error('[DocumentsAdmin] upload error:', err)
      setUploadError('Upload failed — see console for details.')
    } finally {
      setUploading(false)
    }
  }

  // ── Active version enforcement ────────────────────────────────────────────

  /**
   * Deactivates all bylaws for the given season, then activates the target doc.
   *
   * @param targetId   - Firestore document ID to activate.
   * @param season     - Season scope for the deactivation sweep.
   */
  async function batchSetActive(targetId: string, season: string) {
    const snap = await getDocs(query(
      collection(db, 'documents'),
      where('type', '==', 'bylaws'),
      where('seasonYear', '==', season)
    ))
    const batch = writeBatch(db)
    const now = nowIso()
    snap.docs.forEach(d => batch.update(d.ref, { active: false, updatedAt: now }))
    batch.update(doc(db, 'documents', targetId), { active: true, updatedAt: now })
    await batch.commit()
  }

  // ── Save handler ──────────────────────────────────────────────────────────

  /**
   * Writes the document metadata to Firestore and auto-activates it.
   * The PDF is already uploaded at this point; we just record the Drive file ID.
   *
   * @param e - Form submit event.
   */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadedDriveFileId || !seasonYear) return

    setSaving(true)
    try {
      const now = nowIso()
      const today = now.split('T')[0]

      const docRef = await addDoc(collection(db, 'documents'), {
        title: `League Bylaws ${seasonYear}`,
        type: 'bylaws',
        version: pendingVersion,
        seasonYear,
        effectiveDate: today,
        active: false,
        source: { type: 'pdf', content: null, driveFileId: uploadedDriveFileId },
        createdAt: now,
        updatedAt: now,
      })

      // Auto-activate: this version is always the new active one for the season.
      await batchSetActive(docRef.id, seasonYear)
      closeForm()
    } catch (err) {
      console.error('[DocumentsAdmin] save error:', err)
      alert('Save failed — see console for details.')
    } finally {
      setSaving(false)
    }
  }

  // ── Season edit handler ───────────────────────────────────────────────────

  /**
   * Saves a season change for an existing document.
   * Recalculates version number for the new season and auto-activates.
   *
   * @param d         - The document being edited.
   * @param newSeason - The newly selected season year.
   */
  async function handleSaveSeason(d: LeagueDocument, newSeason: string) {
    if (newSeason === d.seasonYear) { setEditingId(null); return }
    setSaving(true)
    try {
      const otherDocs = documents.filter(x => x.id !== d.id)
      const newRevision = nextRevision(otherDocs, newSeason)
      const newVersion = formatVersion(newSeason, newRevision)
      const now = nowIso()
      await updateDoc(doc(db, 'documents', d.id!), {
        seasonYear: newSeason,
        version: newVersion,
        title: `League Bylaws ${newSeason}`,
        updatedAt: now,
      })
      await batchSetActive(d.id!, newSeason)
      setEditingId(null)
    } catch (err) {
      console.error('[DocumentsAdmin] season update error:', err)
      alert('Update failed — see console for details.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  /**
   * Deletes a document after confirmation.
   *
   * @param d - The document to delete.
   */
  async function handleDelete(d: LeagueDocument) {
    const msg = d.active
      ? `"${d.version}" is the active version for ${d.seasonYear}. Delete anyway?`
      : `Delete "${d.version}"? This cannot be undone.`
    if (!window.confirm(msg)) return

    try {
      await deleteDoc(doc(db, 'documents', d.id!))
    } catch (err) {
      console.error('[DocumentsAdmin] delete error:', err)
      alert('Delete failed — see console for details.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const dropEnabled = !!seasonYear && !uploading

  return (
    <div className="documents-admin">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Bylaws</h2>
        {!formOpen && (
          <button className="admin-btn-primary" onClick={openNew}>
            + Upload Bylaws
          </button>
        )}
      </div>

      {/* ── Upload form ─────────────────────────────────────────────── */}
      {formOpen && (
        <form className="doc-form" onSubmit={handleSave}>
          <h3 className="admin-form-title">New Bylaws Document</h3>

          {/* Season selector — must be chosen before upload is enabled */}
          <div className="admin-field">
            <label className="admin-label" htmlFor="doc-season">Season</label>
            <select
              id="doc-season"
              className="admin-select"
              value={seasonYear}
              onChange={e => {
                // Reset upload state if season changes after a file was uploaded
                setSeasonYear(e.target.value)
                setUploadedDriveFileId(null)
                setUploadedFileName('')
                setUploadError(null)
              }}
            >
              <option value="">— Select season —</option>
              {seasons.map(s => (
                <option key={s.year} value={s.year}>{s.year}</option>
              ))}
            </select>
          </div>

          {/* Version preview */}
          {seasonYear && (
            <p className="doc-version-preview">
              Will be saved as <strong>{pendingFileName}</strong>
              {' '}(version <strong>{pendingVersion}</strong>)
            </p>
          )}

          {/* Drop zone — disabled until a season is selected */}
          <div className="admin-field">
            <span className="admin-label">PDF File</span>

            <input
              id="doc-pdf-input"
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
              }}
            />

            <div
              className={[
                'doc-drop-zone',
                !dropEnabled && !uploadedDriveFileId ? 'doc-drop-zone--disabled' : '',
                isDragging       ? 'doc-drop-zone--dragging'  : '',
                uploading        ? 'doc-drop-zone--uploading' : '',
                uploadedDriveFileId && !uploading ? 'doc-drop-zone--done' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => dropEnabled && document.getElementById('doc-pdf-input')?.click()}
              onDragOver={e  => { e.preventDefault(); if (dropEnabled) setIsDragging(true) }}
              onDragEnter={e => { e.preventDefault(); if (dropEnabled) setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                if (!dropEnabled) return
                const file = e.dataTransfer.files?.[0]
                if (file) handleFileSelected(file)
              }}
            >
              {uploading ? (
                <div className="doc-drop-zone-empty">
                  <span className="doc-drop-icon doc-drop-icon--spin">⟳</span>
                  <span className="doc-drop-label">Uploading to Google Drive…</span>
                </div>
              ) : uploadedDriveFileId ? (
                <div className="doc-drop-zone-selected">
                  <span className="doc-drop-icon doc-drop-icon--ok">✓</span>
                  <span className="doc-drop-filename">
                    {uploadedFileName}{' '}—{' '}
                    <a
                      href={driveFileUrl(uploadedDriveFileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      View on Drive
                    </a>
                  </span>
                  <button
                    type="button"
                    className="doc-drop-clear"
                    title="Replace with a different file"
                    onClick={e => {
                      e.stopPropagation()
                      setUploadedDriveFileId(null)
                      setUploadedFileName('')
                      const input = document.getElementById('doc-pdf-input') as HTMLInputElement
                      if (input) input.value = ''
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="doc-drop-zone-empty">
                  <span className="doc-drop-icon">⬆</span>
                  <span className="doc-drop-label">
                    {seasonYear ? 'Drop PDF here or click to browse' : 'Select a season first'}
                  </span>
                  <span className="doc-drop-hint">
                    {seasonYear ? 'Uploads immediately on selection' : ''}
                  </span>
                </div>
              )}
            </div>

            {uploadError && <p className="doc-upload-error">{uploadError}</p>}
          </div>

          <div className="admin-form-actions">
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={saving || uploading || !uploadedDriveFileId || !seasonYear}
            >
              {saving ? 'Saving…' : 'Save Document'}
            </button>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Document list ────────────────────────────────────────────── */}
      {loading && <p className="admin-status">Loading…</p>}
      {error  && <p className="admin-status admin-status-error">Error: {error.message}</p>}

      {!loading && documents.length === 0 && (
        <p className="admin-status">No bylaws uploaded yet. Click "+ Upload Bylaws" to add one.</p>
      )}

      {documents.length > 0 && (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Season</th>
                <th>Status</th>
                <th>File</th>
                <th className="admin-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(d => {
                const isEditing = editingId === d.id
                return (
                  <tr key={d.id} className={d.active ? 'doc-row-active' : ''}>
                    <td className="doc-cell-title">{d.version}</td>
                    <td>
                      {isEditing ? (
                        <select
                          className="admin-select doc-season-select"
                          value={editingSeason}
                          onChange={e => setEditingSeason(e.target.value)}
                          autoFocus
                        >
                          {seasons.map(s => (
                            <option key={s.year} value={s.year}>{s.year}</option>
                          ))}
                        </select>
                      ) : (
                        d.seasonYear ?? '—'
                      )}
                    </td>
                    <td>
                      {d.active
                        ? <span className="doc-badge-active">Active</span>
                        : <span className="doc-badge-inactive">Superseded</span>
                      }
                    </td>
                    <td>
                      {d.source.driveFileId ? (
                        <a
                          href={driveFileUrl(d.source.driveFileId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="doc-pdf-link"
                        >
                          PDF ↗
                        </a>
                      ) : '—'}
                    </td>
                    <td className="admin-col-actions">
                      {isEditing ? (
                        <>
                          <button
                            className="admin-btn-action admin-btn-save"
                            onClick={() => handleSaveSeason(d, editingSeason)}
                            disabled={saving}
                          >
                            {saving ? '…' : 'Save'}
                          </button>
                          <button
                            className="admin-btn-action admin-btn-secondary"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="admin-btn-action admin-btn-edit"
                            onClick={() => { setEditingId(d.id!); setEditingSeason(d.seasonYear ?? '') }}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            className={`admin-btn-action admin-btn-delete${d.active ? ' admin-btn-delete-warn' : ''}`}
                            onClick={() => handleDelete(d)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default DocumentsAdmin
