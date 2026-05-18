/**
 * @file admin.ts
 * @module utils/admin
 *
 * Shared utility functions for admin CRUD panels.
 *
 * These small helpers centralize timestamp generation so that every admin
 * panel produces consistent ISO-8601 strings for `createdAt` / `updatedAt`
 * Firestore fields. Using functions (rather than constants) ensures a fresh
 * timestamp is captured at the moment of each call.
 */

/**
 * Returns the current date-time as a full ISO-8601 string.
 *
 * Used for `createdAt` and `updatedAt` Firestore fields on every admin write.
 *
 * @returns ISO-8601 datetime string, e.g. `"2026-04-18T22:30:00.000Z"`
 */
export const nowIso = (): string => new Date().toISOString()
