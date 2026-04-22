/**
 * @file DocumentsAdmin.tsx
 * @module pages/admin/DocumentsAdmin
 *
 * Admin CRUD panel for the `documents` Firestore collection.
 *
 * Features:
 *  - Lists all document versions grouped by document type.
 *  - Shows title, version, effectiveDate, and active badge per row.
 *  - "Set Active" enforces the invariant: only one document per type+seasonYear
 *    can be active at a time, via an atomic Firestore batch write.
 *  - Inline create/edit form supporting both "Text" (markdown) and "PDF" sources.
 *  - PDF upload to Google Drive via the Vercel `/api/upload-to-drive` endpoint,
 *    storing the returned Drive file ID in `source.driveFileId`.
 *  - Delete with confirmation; warns when attempting to delete the active version.
 *  - All writes include `createdAt` (on create) and `updatedAt` (on every save).
 *
 * Note: Firebase Storage is no longer used by this component. All PDF storage
 * is handled by Google Drive through the authenticated Vercel serverless endpoint.
 */

import { useState } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  orderBy,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { driveFileUrl } from '../../utils/drive'
import { useCollection } from '../../hooks/useFirestore'
import type { LeagueDocument } from '../../types'
import { nowIso } from '../../utils/admin'
import './DocumentsAdmin.css'

// ── Constants ────────────────────────────────────────────────────────────────

/** All valid document type values from the LeagueDocument schema. */
const DOC_TYPES = ['bylaws', 'rules', 'prizefund', 'handbook', 'other'] as const
type DocType = typeof DOC_TYPES[number]

// ── Form shape ────────────────────────────────────────────────────────────────

/** Local form state — all string/boolean so HTML inputs stay controlled. */
interface DocumentForm {
  title: string
  type: DocType
  version: string
  seasonYear: string
  effectiveDate: string
  active: boolean
  /** 'text' or 'pdf' source toggle */
  sourceType: 'text' | 'pdf'
  /** Markdown content when sourceType == 'text' */
  content: string
  /** Pending File object for PDF upload (not yet uploaded) */
  pdfFile: File | null
  /**
   * Existing Drive file ID (populated when editing a pdf-source doc).
   * Used to show the "Current file" link without requiring a re-upload.
   */
  existingDriveFileId: string
}

/** Returns a blank form with sensible defaults. */
function emptyForm(): DocumentForm {
  return {
    title: '',
    type: 'bylaws',
    version: '',
    seasonYear: '',
    effectiveDate: '',
    active: false,
    sourceType: 'text',
    content: '',
    pdfFile: null,
    existingDriveFileId: '',
  }
}

/**
 * Converts a LeagueDocument into the local form state for editing.
 *
 * @param d - The LeagueDocument fetched from Firestore to pre-fill the form.
 * @returns A DocumentForm object with all fields populated from the document.
 */
function docToForm(d: LeagueDocument): DocumentForm {
  return {
    title: d.title,
    type: d.type,
    version: d.version,
    seasonYear: d.seasonYear ?? '',
    effectiveDate: d.effectiveDate,
    active: d.active,
    sourceType: d.source.type,
    content: d.source.content ?? '',
    pdfFile: null,
    // Map the Drive file ID stored in Firestore into local form state
    existingDriveFileId: d.source.driveFileId ?? '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * DocumentsAdmin component.
 *
 * Renders a full CRUD interface for the `documents` Firestore collection.
 * Documents are displayed grouped by type. The create/edit form appears inline
 * above the grouped list when active.
 *
 * PDF uploads are handled by posting multipart/form-data to the Vercel
 * serverless endpoint `/api/upload-to-drive`, authenticated with a Firebase
 * ID token. The returned Drive file ID is stored in `source.driveFileId`.
 *
 * @returns JSX element for the documents admin panel.
 */
function DocumentsAdmin() {
  const { data: documents, loading, error } = useCollection<LeagueDocument>(
    'documents',
    [orderBy('type', 'asc'), orderBy('effectiveDate', 'desc')]
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DocumentForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  // ── Form helpers ─────────────────────────────────────────────────────────

  /** Opens the form for creating a new document. */
  function openNew() {
    setForm(emptyForm())
    setEditingId(null)
    setFormOpen(true)
  }

  /** Opens the form pre-filled with an existing document for editing. */
  function openEdit(d: LeagueDocument) {
    setForm(docToForm(d))
    setEditingId(d.id ?? null)
    setFormOpen(true)
  }

  /** Closes and resets the form. */
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setUploadProgress(null)
  }

  /**
   * Updates a single text field in the form state.
   *
   * @param field - The form field key to update.
   * @param value - The new value.
   */
  function setField<K extends keyof DocumentForm>(field: K, value: DocumentForm[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Active version enforcement ───────────────────────────────────────────

  /**
   * Runs an atomic Firestore batch that:
   *  1. Queries all documents with matching `type` + `seasonYear`.
   *  2. Sets `active: false` on all of them.
   *  3. Sets `active: true` on the target document.
   *
   * This enforces the invariant: at most one active version per type+season.
   *
   * @param targetId - Firestore document ID to set as active.
   * @param type - Document type for the query scope.
   * @param seasonYear - Season year for the query scope.
   */
  async function batchSetActive(targetId: string, type: string, seasonYear: string) {
    const q = query(
      collection(db, 'documents'),
      where('type', '==', type),
      where('seasonYear', '==', seasonYear)
    )
    const snapshot = await getDocs(q)
    const batch = writeBatch(db)
    const now = nowIso()

    // Deactivate all siblings first
    snapshot.docs.forEach(snap => {
      batch.update(snap.ref, { active: false, updatedAt: now })
    })

    // Activate the target document
    batch.update(doc(db, 'documents', targetId), { active: true, updatedAt: now })

    await batch.commit()
  }

  // ── Save handler ─────────────────────────────────────────────────────────

  /**
   * Handles form submission for both create and edit operations.
   *
   * If source type is 'pdf' and a new file was selected, uploads it to Google
   * Drive via POST /api/upload-to-drive (authenticated with a Firebase ID token)
   * before saving the Firestore document with the returned Drive file ID.
   * If `active` is true, runs the batch deactivation after the document is written.
   *
   * @param e - The form submit event.
   */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setUploadProgress(null)

    try {
      // ── Resolve the final Drive file ID ──────────────────────────────────
      let driveFileId: string | null = null

      if (form.sourceType === 'pdf') {
        if (form.pdfFile) {
          // Upload new PDF to Google Drive via the Vercel serverless endpoint.
          // The endpoint requires a Bearer token from the authenticated admin user.
          setUploadProgress('Uploading to Google Drive…')

          // Get a fresh Firebase ID token to authenticate the Drive upload
          const token = await auth.currentUser!.getIdToken()

          // Build the multipart form payload the endpoint expects
          const formData = new FormData()
          formData.append('file', form.pdfFile)
          formData.append('folderId', import.meta.env.VITE_DRIVE_FOLDER_BYLAWS)
          formData.append(
            'fileName',
            `bylaws-${form.seasonYear}-${form.version}.pdf`
          )

          const res = await fetch('/api/upload-to-drive', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          })

          if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Drive upload failed (${res.status}): ${errText}`)
          }

          const { fileId } = await res.json()
          driveFileId = fileId
          setUploadProgress(null)
        } else {
          // No new file selected — keep the existing Drive file ID when editing
          driveFileId = form.existingDriveFileId || null
        }
      }

      // Build the source sub-document to write to Firestore.
      // driveFileId is null for text documents; populated for PDFs.
      const source = {
        type: form.sourceType,
        content: form.sourceType === 'text' ? (form.content || null) : null,
        driveFileId: form.sourceType === 'pdf' ? driveFileId : null,
      }

      const now = nowIso()

      if (editingId) {
        // ── Edit existing document ────────────────────────────────────────
        await updateDoc(doc(db, 'documents', editingId), {
          title: form.title,
          type: form.type,
          version: form.version,
          seasonYear: form.seasonYear || null,
          effectiveDate: form.effectiveDate,
          active: form.active,
          source,
          updatedAt: now,
        })

        // Enforce single-active invariant after saving
        if (form.active && form.seasonYear) {
          await batchSetActive(editingId, form.type, form.seasonYear)
        }
      } else {
        // ── Create new document ───────────────────────────────────────────
        const docRef = await addDoc(collection(db, 'documents'), {
          title: form.title,
          type: form.type,
          version: form.version,
          seasonYear: form.seasonYear || null,
          effectiveDate: form.effectiveDate,
          active: form.active,
          source,
          createdAt: now,
          updatedAt: now,
        })

        // Enforce single-active invariant after creating
        if (form.active && form.seasonYear) {
          await batchSetActive(docRef.id, form.type, form.seasonYear)
        }
      }

      closeForm()
    } catch (err) {
      console.error('DocumentsAdmin save error:', err)
      alert('Save failed — see console for details.')
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  // ── Delete handler ───────────────────────────────────────────────────────

  /**
   * Deletes a document after user confirmation.
   * Warns (but does not block) if the document is the active version.
   *
   * @param d - The LeagueDocument to delete.
   */
  async function handleDelete(d: LeagueDocument) {
    const warning = d.active
      ? `"${d.title}" is the ACTIVE version. Activate another version first.\n\nDelete anyway?`
      : `Delete "${d.title}" (${d.version})? This cannot be undone.`

    if (!window.confirm(warning)) return

    try {
      await deleteDoc(doc(db, 'documents', d.id!))
    } catch (err) {
      console.error('DocumentsAdmin delete error:', err)
      alert('Delete failed — see console for details.')
    }
  }

  // ── Set Active handler ────────────────────────────────────────────────────

  /**
   * Sets a document as the active version for its type+season via batch.
   *
   * @param d - The LeagueDocument to activate.
   */
  async function handleSetActive(d: LeagueDocument) {
    if (!d.id || !d.seasonYear) {
      alert('Cannot set active: document is missing an ID or seasonYear.')
      return
    }
    try {
      await batchSetActive(d.id, d.type, d.seasonYear)
    } catch (err) {
      console.error('DocumentsAdmin setActive error:', err)
      alert('Failed to set active — see console for details.')
    }
  }

  // ── Group documents by type ──────────────────────────────────────────────

  /**
   * Groups the flat documents array into a Map keyed by document type.
   * Preserves the order returned by Firestore (type asc, effectiveDate desc).
   */
  const grouped = documents.reduce<Map<string, LeagueDocument[]>>((acc, d) => {
    const list = acc.get(d.type) ?? []
    list.push(d)
    acc.set(d.type, list)
    return acc
  }, new Map())

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="documents-admin">
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Documents</h2>
        {!formOpen && (
          <button className="admin-btn-primary" onClick={openNew}>
            + New Document
          </button>
        )}
      </div>

      {/* ── Create / Edit form ─────────────────────────────────────────────── */}
      {formOpen && (
        <form className="doc-form admin-form" onSubmit={handleSave}>
          <h3 className="admin-form-title">
            {editingId ? 'Edit Document' : 'New Document'}
          </h3>

          {/* Title */}
          <div className="admin-field">
            <label className="admin-label" htmlFor="doc-title">Title</label>
            <input
              id="doc-title"
              className="admin-input"
              type="text"
              required
              value={form.title}
              onChange={e => setField('title', e.target.value)}
            />
          </div>

          {/* Type + Version row */}
          <div className="admin-row-2">
            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-type">Type</label>
              <select
                id="doc-type"
                className="admin-select"
                value={form.type}
                onChange={e => setField('type', e.target.value as DocType)}
              >
                {DOC_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-version">Version</label>
              <input
                id="doc-version"
                className="admin-input"
                type="text"
                required
                placeholder="e.g. v2.1"
                value={form.version}
                onChange={e => setField('version', e.target.value)}
              />
            </div>
          </div>

          {/* Season Year + Effective Date row */}
          <div className="admin-row-2">
            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-season">Season Year</label>
              <input
                id="doc-season"
                className="admin-input"
                type="text"
                placeholder="e.g. 2025-2026"
                value={form.seasonYear}
                onChange={e => setField('seasonYear', e.target.value)}
              />
            </div>

            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-date">Effective Date</label>
              <input
                id="doc-date"
                className="admin-input"
                type="date"
                required
                value={form.effectiveDate}
                onChange={e => setField('effectiveDate', e.target.value)}
              />
            </div>
          </div>

          {/* Active checkbox */}
          <div className="admin-field admin-field-check">
            <label className="admin-check-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setField('active', e.target.checked)}
              />
              Set as active version (deactivates other versions of same type + season)
            </label>
          </div>

          {/* Source type toggle */}
          <div className="admin-field">
            <span className="admin-label">Content Source</span>
            <div className="doc-source-toggle">
              <button
                type="button"
                className={`doc-toggle-btn ${form.sourceType === 'text' ? 'active' : ''}`}
                onClick={() => setField('sourceType', 'text')}
              >
                Text (Markdown)
              </button>
              <button
                type="button"
                className={`doc-toggle-btn ${form.sourceType === 'pdf' ? 'active' : ''}`}
                onClick={() => setField('sourceType', 'pdf')}
              >
                PDF Upload
              </button>
            </div>
          </div>

          {/* Text content */}
          {form.sourceType === 'text' && (
            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-content">
                Markdown Content
              </label>
              <textarea
                id="doc-content"
                className="admin-textarea doc-textarea"
                rows={10}
                placeholder="Write document content in Markdown…"
                value={form.content}
                onChange={e => setField('content', e.target.value)}
              />
            </div>
          )}

          {/* PDF upload — shows existing Drive file link when editing without a new file */}
          {form.sourceType === 'pdf' && (
            <div className="admin-field">
              <label className="admin-label" htmlFor="doc-pdf">PDF File</label>
              {form.existingDriveFileId && !form.pdfFile && (
                <p className="doc-existing-url">
                  Current file:{' '}
                  <a
                    href={driveFileUrl(form.existingDriveFileId)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View PDF
                  </a>
                  {' '}(upload a new file to replace)
                </p>
              )}
              <input
                id="doc-pdf"
                className="admin-input"
                type="file"
                accept=".pdf"
                onChange={e => setField('pdfFile', e.target.files?.[0] ?? null)}
              />
              {uploadProgress && (
                <p className="doc-upload-progress">{uploadProgress}</p>
              )}
            </div>
          )}

          {/* Form actions */}
          <div className="admin-form-actions">
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Document'}
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

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {loading && <p className="admin-status">Loading documents…</p>}
      {error && <p className="admin-status admin-status-error">Error: {error.message}</p>}

      {!loading && documents.length === 0 && (
        <p className="admin-status">No documents yet. Click "+ New Document" to add one.</p>
      )}

      {/* Render each type group */}
      {Array.from(grouped.entries()).map(([type, docs]) => (
        <section key={type} className="doc-group">
          <h3 className="doc-group-heading">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Version</th>
                <th>Season</th>
                <th>Effective Date</th>
                <th>Status</th>
                <th>Source</th>
                <th className="admin-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className={d.active ? 'doc-row-active' : ''}>
                  <td className="doc-cell-title">{d.title}</td>
                  <td>{d.version}</td>
                  <td>{d.seasonYear ?? '—'}</td>
                  <td>{d.effectiveDate}</td>
                  <td>
                    {d.active ? (
                      <span className="doc-badge-active">Active</span>
                    ) : (
                      <span className="doc-badge-inactive">Inactive</span>
                    )}
                  </td>
                  <td>
                    {d.source.type === 'pdf' ? (
                      // Use driveFileUrl() to generate the Drive viewer link from the stored file ID
                      <a
                        href={d.source.driveFileId ? driveFileUrl(d.source.driveFileId) : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="doc-pdf-link"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="doc-source-text">Text</span>
                    )}
                  </td>
                  <td className="admin-col-actions">
                    {!d.active && d.seasonYear && (
                      <button
                        className="admin-btn-action admin-btn-activate"
                        onClick={() => handleSetActive(d)}
                        title="Set as active version"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      className="admin-btn-action admin-btn-edit"
                      onClick={() => openEdit(d)}
                    >
                      Edit
                    </button>
                    <button
                      className={`admin-btn-action admin-btn-delete ${d.active ? 'admin-btn-delete-warn' : ''}`}
                      onClick={() => handleDelete(d)}
                      title={d.active ? 'Warning: this is the active version' : 'Delete'}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

export default DocumentsAdmin
