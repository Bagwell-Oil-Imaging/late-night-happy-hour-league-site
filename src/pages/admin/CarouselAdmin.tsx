/**
 * @file CarouselAdmin.tsx
 * @module pages/admin/CarouselAdmin
 *
 * Admin CRUD panel for the `carouselImages` Firestore collection.
 *
 * Features:
 *  - Lists all carousel images sorted by `order` ascending.
 *  - Shows an image thumbnail when `imageUrl` is an http/https URL.
 *  - Up/Down arrow buttons to reorder items (swaps `order` values).
 *  - Inline create/edit form covering all CarouselImage fields.
 *  - Delete with window.confirm() guard.
 *  - All writes include `createdAt` (on create) and `updatedAt` (on every save).
 *  - Belt-and-suspenders auth check: writes are blocked if no current user.
 *
 * Note: imageUrl accepts a plain URL string. Firebase Storage upload integration
 * is deferred to a future enhancement.
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
import type { CarouselImage } from '../../types'
import { nowIso } from '../../utils/admin'
import './AnnouncementsAdmin.css' // shared admin panel styles

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Local form state — all string so HTML inputs stay controlled. */
interface CarouselForm {
  title: string
  description: string
  imageUrl: string
  alt: string
  /** String representation of the numeric order field. */
  order: string
}

/** Returns a fresh empty form. */
function emptyForm(): CarouselForm {
  return {
    title: '',
    description: '',
    imageUrl: '',
    alt: '',
    order: '0',
  }
}

/**
 * Returns true if `url` looks like a fully-qualified HTTP(S) URL suitable
 * for use in an <img> src. Used to decide whether to render a thumbnail.
 *
 * @param url - String to test.
 */
function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * CarouselAdmin component.
 *
 * Renders a full CRUD interface for the `carouselImages` Firestore collection,
 * including up/down arrow reorder controls that swap `order` field values between
 * adjacent rows.
 *
 * @returns JSX element for the carousel admin panel.
 */
function CarouselAdmin() {
  // Fetch ALL carousel images sorted by order ascending
  const { data: images, loading, error } = useCollection<CarouselImage>(
    'carouselImages',
    [orderBy('order', 'asc')]
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CarouselForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // ── Form helpers ────────────────────────────────────────────────────────

  /** Opens the form for creating a new carousel image. */
  function openNew() {
    setEditingId(null)
    // Default order to one beyond the current highest
    const nextOrder = images.length > 0
      ? Math.max(...images.map(i => i.order)) + 1
      : 0
    setForm({ ...emptyForm(), order: String(nextOrder) })
    setFormOpen(true)
  }

  /**
   * Opens the form pre-filled with an existing carousel image's data.
   *
   * @param item - The CarouselImage document to edit.
   */
  function openEdit(item: CarouselImage) {
    setEditingId(item.id ?? null)
    setForm({
      title: item.title,
      description: item.description,
      imageUrl: item.imageUrl,
      alt: item.alt,
      order: String(item.order),
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
   * Generic change handler for text inputs.
   *
   * @param field - Key of CarouselForm to update.
   * @param value - New string value.
   */
  function handleChange(field: keyof CarouselForm, value: string) {
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
    if (!form.title.trim()) {
      alert('Title is required.')
      return
    }

    setSaving(true)
    try {
      const orderNum = parseInt(form.order, 10)
      const basePayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
        alt: form.alt.trim(),
        order: isNaN(orderNum) ? 0 : orderNum,
        updatedAt: nowIso(),
      }

      if (editingId) {
        await updateDoc(doc(db, 'carouselImages', editingId), basePayload)
      } else {
        await addDoc(collection(db, 'carouselImages'), {
          ...basePayload,
          createdAt: nowIso(),
        })
      }

      closeForm()
    } catch (err) {
      console.error('[CarouselAdmin] save error:', err)
      alert('Save failed. Check the console for details.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes a carousel image after user confirmation.
   *
   * @param id - Firestore document ID to delete.
   * @param title - Human-readable title shown in the confirm dialog.
   */
  async function handleDelete(id: string, title: string) {
    if (!auth.currentUser) {
      alert('You must be signed in to make changes.')
      return
    }
    if (!window.confirm(`Delete carousel image "${title}"? This cannot be undone.`)) return

    try {
      await deleteDoc(doc(db, 'carouselImages', id))
    } catch (err) {
      console.error('[CarouselAdmin] delete error:', err)
      alert('Delete failed. Check the console for details.')
    }
  }

  /**
   * Swaps the `order` field values of two adjacent images to reorder them.
   *
   * @param indexA - Index of the first image in the sorted `images` array.
   * @param indexB - Index of the second image (must be adjacent to indexA).
   */
  async function swapOrder(indexA: number, indexB: number) {
    if (!auth.currentUser) return
    const a = images[indexA]
    const b = images[indexB]
    if (!a.id || !b.id) return

    try {
      // Write both updates — a tiny race window exists but is acceptable for admin
      await updateDoc(doc(db, 'carouselImages', a.id), {
        order: b.order,
        updatedAt: nowIso(),
      })
      await updateDoc(doc(db, 'carouselImages', b.id), {
        order: a.order,
        updatedAt: nowIso(),
      })
    } catch (err) {
      console.error('[CarouselAdmin] reorder error:', err)
      alert('Reorder failed. Check the console for details.')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header row ────────────────────────────────────────────────── */}
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Carousel Images</h1>
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
            {editingId ? 'Edit Carousel Image' : 'New Carousel Image'}
          </h2>

          <div className="admin-form-grid">
            {/* Title */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="car-title">Title *</label>
              <input
                id="car-title"
                className="admin-form-input"
                type="text"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                placeholder="Image title"
              />
            </div>

            {/* Image URL */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="car-url">Image URL</label>
              <input
                id="car-url"
                className="admin-form-input"
                type="text"
                value={form.imageUrl}
                onChange={e => handleChange('imageUrl', e.target.value)}
                placeholder="https://…"
              />
            </div>

            {/* Alt text */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="car-alt">Alt Text</label>
              <input
                id="car-alt"
                className="admin-form-input"
                type="text"
                value={form.alt}
                onChange={e => handleChange('alt', e.target.value)}
                placeholder="Descriptive alt text for accessibility"
              />
            </div>

            {/* Order */}
            <div className="admin-form-field">
              <label className="admin-form-label" htmlFor="car-order">Order</label>
              <input
                id="car-order"
                className="admin-form-input"
                type="number"
                value={form.order}
                onChange={e => handleChange('order', e.target.value)}
                min="0"
              />
            </div>

            {/* Description */}
            <div className="admin-form-field admin-form-field--full">
              <label className="admin-form-label" htmlFor="car-desc">Description</label>
              <textarea
                id="car-desc"
                className="admin-form-textarea"
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Optional caption or description"
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
      {loading && <p className="admin-loading">Loading carousel images…</p>}
      {error && <p className="admin-error">Error: {error.message}</p>}

      {!loading && !error && (
        images.length === 0 ? (
          <p className="admin-empty">No carousel images yet. Click "+ New" to add one.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Thumbnail</th>
                  <th>Title</th>
                  <th>Alt</th>
                  <th>Reorder</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {images.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{item.order}</td>
                    <td>
                      {isHttpUrl(item.imageUrl) ? (
                        <img
                          src={item.imageUrl}
                          alt={item.alt || item.title}
                          style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 4 }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No image
                        </span>
                      )}
                    </td>
                    <td>{item.title}</td>
                    <td>{item.alt || '—'}</td>
                    <td>
                      {/* Move up — disabled for first item */}
                      <button
                        className="admin-btn-secondary"
                        style={{ padding: '2px 8px', marginRight: 4 }}
                        onClick={() => swapOrder(idx, idx - 1)}
                        disabled={idx === 0}
                        type="button"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      {/* Move down — disabled for last item */}
                      <button
                        className="admin-btn-secondary"
                        style={{ padding: '2px 8px' }}
                        onClick={() => swapOrder(idx, idx + 1)}
                        disabled={idx === images.length - 1}
                        type="button"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </td>
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

export default CarouselAdmin
