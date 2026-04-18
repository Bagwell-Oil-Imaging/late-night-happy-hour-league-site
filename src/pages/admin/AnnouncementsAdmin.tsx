/**
 * @file AnnouncementsAdmin.tsx
 * @module pages/admin/AnnouncementsAdmin
 *
 * Admin CRUD panel for the `announcements` Firestore collection.
 *
 * Features:
 *  - Lists ALL announcements (including expired) ordered by date descending.
 *  - Inline create/edit form with all Announcement fields.
 *  - Delete with window.confirm() guard.
 *  - All writes include `createdAt` (on create) and `updatedAt` (on every save).
 *  - Belt-and-suspenders auth check: writes are blocked if no current user.
 */

import { useState } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { useCollection } from '../../hooks/useFirestore'
import type { Announcement } from '../../types'
import { nowIso } from '../../utils/admin'
import './AnnouncementsAdmin.css'

// ── Blank form state ─────────────────────────────────────────────────────────

/** Returns a fresh empty form matching the Announcement shape (minus server fields). */
function emptyForm(): AnnouncementForm {
  return {
    title: '',
    message: '',
    date: '',
    type: 'info',
    priority: 'normal',
    pinned: false,
    expiresAt: '',
  }
}

/** Local form state — all string/boolean so HTML inputs stay controlled. */
interface AnnouncementForm {
  title: string
  message: string
  date: string
  type: 'reminder' | 'event' | 'info'
  priority: 'low' | 'normal' | 'high'
  pinned: boolean
  /** Empty string means "no expiry" — stored as null in Firestore. */
  expiresAt: string
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * AnnouncementsAdmin component.
 *
 * Renders a full CRUD interface for the `announcements` collection.
 * The form appears inline above the table when the user clicks "New" or "Edit".
 *
 * @returns JSX element for the announcements admin panel.
 */
function AnnouncementsAdmin() {
  // Fetch ALL announcements — admin needs to see expired ones too.
  const { data: announcements, loading, error } = useCollection<Announcement>(
    'announcements',
    [orderBy('date', 'desc')]
  )

  // Form visibility and which document is being edited (null = new)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // ── Form helpers ────────────────────────────────────────────────────────

  /** Opens the form for creating a new announcement. */
  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  /**
   * Opens the form pre-filled with an existing announcement's data.
   *
   * @param item - The Announcement document to edit.
   */
  function openEdit(item: Announcement) {
    setEditingId(item.id ?? null)
    setForm({
      title: item.title,
      message: item.message,
      date: item.date,
      type: item.type,
      priority: item.priority,
      pinned: item.pinned,
      // Convert null back to empty string for the date input
      expiresAt: item.expiresAt ?? '',
    })
    setFormOpen(true)
  }

  /** Closes and resets the inline form. */
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  /**
   * Generic field change handler for text/select/date inputs.
   *
   * @param field - Key of AnnouncementForm to update.
   * @param value - New string value from the input.
   */
  function handleChange(field: keyof AnnouncementForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Firestore operations ─────────────────────────────────────────────────

  /**
   * Saves the form — creates a new document or updates an existing one.
   * Blocked if no authenticated user is present (belt-and-suspenders).
   */
  async function handleSave() {
    if (!auth.currentUser) {
      alert('You must be signed in to make changes.')
      return
    }
    if (!form.title.trim() || !form.date) {
      alert('Title and date are required.')
      return
    }

    setSaving(true)
    try {
      const payload: Omit<Announcement, 'id'> = {
        title: form.title.trim(),
        message: form.message.trim(),
        date: form.date,
        type: form.type,
        priority: form.priority,
        pinned: form.pinned,
        // Empty string → null (no expiry)
        expiresAt: form.expiresAt || null,
        createdAt: editingId ? '' : nowIso(), // filled below per branch
        updatedAt: nowIso(),
      }

      if (editingId) {
        // Update existing document — preserve original createdAt
        const ref = doc(db, 'announcements', editingId)
        const { createdAt: _drop, ...updatePayload } = payload
        await updateDoc(ref, { ...updatePayload, updatedAt: nowIso() })
      } else {
        // Create new document — set both timestamps
        await addDoc(collection(db, 'announcements'), {
          ...payload,
          createdAt: nowIso(),
        })
      }

      closeForm()
    } catch (err) {
      console.error('[AnnouncementsAdmin] save error:', err)
      alert('Save failed. Check the console for details.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes an announcement after user confirmation.
   *
   * @param id - Firestore document ID to delete.
   * @param title - Human-readable title shown in the confirm dialog.
   */
  async function handleDelete(id: string, title: string) {
    if (!auth.currentUser) {
      alert('You must be signed in to make changes.')
      return
    }
    if (!window.confirm(`Delete announcement "${title}"? This cannot be undone.`)) return

    try {
      await deleteDoc(doc(db, 'announcements', id))
    } catch (err) {
      console.error('[AnnouncementsAdmin] delete error:', err)
      alert('Delete failed. Check the console for details.')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header row ────────────────────────────────────────────────── */}
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Announcements</h1>
        {!formOpen && (
          <button className="admin-btn-primary" onClick={openNew} type="button">
            + New
          </button>
        )}
      </div>

      {/* ── Inline create / edit form ──────────────────────────────────── */}
      {formOpen && (
        <div className="admin-form-card">
          <h2 className="admin-form-title">
            {editingId ? 'Edit Announcement' : 'New Announcement'}
          </h2>

          <div className="admin-form-grid">
            {/* Title */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="ann-title">Title *</label>
              <input
                id="ann-title"
                className="admin-form-input"
                type="text"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                placeholder="Announcement title"
              />
            </div>

            {/* Message */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="ann-message">Message</label>
              <textarea
                id="ann-message"
                className="admin-form-textarea"
                value={form.message}
                onChange={e => handleChange('message', e.target.value)}
                placeholder="Announcement body text"
              />
            </div>

            {/* Date */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="ann-date">Date *</label>
              <input
                id="ann-date"
                className="admin-form-input"
                type="date"
                value={form.date}
                onChange={e => handleChange('date', e.target.value)}
              />
            </div>

            {/* Type */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="ann-type">Type</label>
              <select
                id="ann-type"
                className="admin-form-select"
                value={form.type}
                onChange={e => handleChange('type', e.target.value as AnnouncementForm['type'])}
              >
                <option value="info">Info</option>
                <option value="reminder">Reminder</option>
                <option value="event">Event</option>
              </select>
            </div>

            {/* Priority */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="ann-priority">Priority</label>
              <select
                id="ann-priority"
                className="admin-form-select"
                value={form.priority}
                onChange={e => handleChange('priority', e.target.value as AnnouncementForm['priority'])}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Expires At */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="ann-expires">Expires At (optional)</label>
              <input
                id="ann-expires"
                className="admin-form-input"
                type="date"
                value={form.expiresAt}
                onChange={e => handleChange('expiresAt', e.target.value)}
              />
            </div>

            {/* Pinned */}
            <div className="admin-form-checkbox-row">
              <input
                id="ann-pinned"
                type="checkbox"
                checked={form.pinned}
                onChange={e => handleChange('pinned', e.target.checked)}
              />
              <label className="admin-form-checkbox-label" htmlFor="ann-pinned">
                Pin to top
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="admin-form-actions">
            <button
              className="admin-btn-primary"
              onClick={handleSave}
              disabled={saving}
              type="button"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="admin-btn-secondary"
              onClick={closeForm}
              disabled={saving}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── List table ────────────────────────────────────────────────── */}
      {loading && <p className="admin-loading">Loading announcements…</p>}
      {error && <p className="admin-error">Error: {error.message}</p>}

      {!loading && !error && (
        announcements.length === 0 ? (
          <p className="admin-empty">No announcements yet. Click "+ New" to create one.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Pinned</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map(item => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.date}</td>
                    <td>{item.type}</td>
                    <td>{item.priority}</td>
                    <td>
                      {item.pinned && (
                        <span className="admin-badge-pinned">Pinned</span>
                      )}
                    </td>
                    <td>{item.expiresAt ?? '—'}</td>
                    <td>
                      <button
                        className="admin-btn-edit"
                        onClick={() => openEdit(item)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="admin-btn-danger"
                        onClick={() => item.id && handleDelete(item.id, item.title)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default AnnouncementsAdmin
