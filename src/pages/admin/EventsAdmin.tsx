/**
 * @file EventsAdmin.tsx
 * @module pages/admin/EventsAdmin
 *
 * Admin CRUD panel for the `events` Firestore collection.
 *
 * Features:
 *  - Lists all league events ordered by date descending.
 *  - Inline create/edit form covering all Event fields.
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
import type { Event } from '../../types'
import { nowIso } from '../../utils/admin'
import './EventsAdmin.css'

// ── Blank form state ─────────────────────────────────────────────────────────

/** Local form state — all string/boolean so HTML inputs stay controlled. */
interface EventForm {
  title: string
  date: string
  /** Empty string means "no end date" — stored as null in Firestore. */
  endDate: string
  allDay: boolean
  location: string
  type: 'regular' | 'tournament' | 'social' | 'banquet'
  description: string
}

/** Returns a fresh empty form matching the Event shape (minus server fields). */
function emptyForm(): EventForm {
  return {
    title: '',
    date: '',
    endDate: '',
    allDay: false,
    location: '',
    type: 'regular',
    description: '',
  }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * EventsAdmin component.
 *
 * Renders a full CRUD interface for the `events` Firestore collection.
 * The form appears inline above the table when the user clicks "New" or "Edit".
 *
 * @returns JSX element for the events admin panel.
 */
function EventsAdmin() {
  // Fetch ALL events ordered by date descending
  const { data: events, loading, error } = useCollection<Event>(
    'events',
    [orderBy('date', 'desc')]
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // ── Form helpers ────────────────────────────────────────────────────────

  /** Opens the form for creating a new event. */
  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  /**
   * Opens the form pre-filled with an existing event's data.
   *
   * @param item - The Event document to edit.
   */
  function openEdit(item: Event) {
    setEditingId(item.id ?? null)
    setForm({
      title: item.title,
      date: item.date,
      endDate: item.endDate ?? '',
      allDay: item.allDay,
      location: item.location,
      type: item.type,
      description: item.description,
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
   * Generic change handler for text/select/date inputs.
   *
   * @param field - Key of EventForm to update.
   * @param value - New value from the input.
   */
  function handleChange(field: keyof EventForm, value: string | boolean) {
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
      const basePayload = {
        title: form.title.trim(),
        date: form.date,
        endDate: form.endDate || null,
        allDay: form.allDay,
        location: form.location.trim(),
        type: form.type,
        description: form.description.trim(),
        updatedAt: nowIso(),
      }

      if (editingId) {
        await updateDoc(doc(db, 'events', editingId), basePayload)
      } else {
        await addDoc(collection(db, 'events'), {
          ...basePayload,
          createdAt: nowIso(),
        })
      }

      closeForm()
    } catch (err) {
      console.error('[EventsAdmin] save error:', err)
      alert('Save failed. Check the console for details.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes an event after user confirmation.
   *
   * @param id - Firestore document ID to delete.
   * @param title - Human-readable title shown in the confirm dialog.
   */
  async function handleDelete(id: string, title: string) {
    if (!auth.currentUser) {
      alert('You must be signed in to make changes.')
      return
    }
    if (!window.confirm(`Delete event "${title}"? This cannot be undone.`)) return

    try {
      await deleteDoc(doc(db, 'events', id))
    } catch (err) {
      console.error('[EventsAdmin] delete error:', err)
      alert('Delete failed. Check the console for details.')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header row ────────────────────────────────────────────────── */}
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Events</h1>
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
            {editingId ? 'Edit Event' : 'New Event'}
          </h2>

          <div className="admin-form-grid">
            {/* Title */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="evt-title">Title *</label>
              <input
                id="evt-title"
                className="admin-form-input"
                type="text"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                placeholder="Event title"
              />
            </div>

            {/* Date */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="evt-date">Date *</label>
              <input
                id="evt-date"
                className="admin-form-input"
                type="date"
                value={form.date}
                onChange={e => handleChange('date', e.target.value)}
              />
            </div>

            {/* End Date */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="evt-end-date">
                End Date (optional)
              </label>
              <input
                id="evt-end-date"
                className="admin-form-input"
                type="date"
                value={form.endDate}
                onChange={e => handleChange('endDate', e.target.value)}
              />
            </div>

            {/* Location */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="evt-location">Location</label>
              <input
                id="evt-location"
                className="admin-form-input"
                type="text"
                value={form.location}
                onChange={e => handleChange('location', e.target.value)}
                placeholder="Event location"
              />
            </div>

            {/* Type */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="evt-type">Type</label>
              <select
                id="evt-type"
                className="admin-form-select"
                value={form.type}
                onChange={e => handleChange('type', e.target.value as EventForm['type'])}
              >
                <option value="regular">Regular</option>
                <option value="tournament">Tournament</option>
                <option value="social">Social</option>
                <option value="banquet">Banquet</option>
              </select>
            </div>

            {/* All Day */}
            <div className="admin-form-checkbox-row">
              <input
                id="evt-all-day"
                type="checkbox"
                checked={form.allDay}
                onChange={e => handleChange('allDay', e.target.checked)}
              />
              <label className="admin-form-checkbox-label" htmlFor="evt-all-day">
                All day
              </label>
            </div>

            {/* Description */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="evt-desc">Description</label>
              <textarea
                id="evt-desc"
                className="admin-form-textarea"
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Event description"
              />
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
      {loading && <p className="admin-loading">Loading events…</p>}
      {error && <p className="admin-error">Error: {error.message}</p>}

      {!loading && !error && (
        events.length === 0 ? (
          <p className="admin-empty">No events yet. Click "+ New" to create one.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>End Date</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map(item => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.date}</td>
                    <td>{item.endDate ?? '—'}</td>
                    <td>{item.location}</td>
                    <td>{item.type}</td>
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

export default EventsAdmin
