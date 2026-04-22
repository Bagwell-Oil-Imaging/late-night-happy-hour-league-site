/**
 * @file useFirestore.ts
 * @module hooks/useFirestore
 *
 * Generic React hooks for subscribing to Firestore collections and documents
 * with real-time updates. These are low-level building blocks; prefer the
 * domain-specific hooks exported from `./index.ts` in application code.
 *
 * Both hooks:
 *  - Set `loading: true` on initial mount and `false` once the first snapshot arrives
 *  - Capture Firestore errors into `error` state rather than throwing
 *  - Automatically inject the Firestore document `id` into every returned object
 *  - Clean up the `onSnapshot` listener when the calling component unmounts
 */

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';

// ---------------------------------------------------------------------------
// useCollection
// ---------------------------------------------------------------------------

/**
 * Subscribes to a Firestore collection query with real-time updates.
 *
 * Automatically includes the Firestore document ID as `id` on each returned
 * item so callers never need to handle raw `DocumentSnapshot` objects.
 *
 * Firebase `QueryConstraint` objects are opaque SDK instances — their field
 * names and filter values are not enumerable, so React cannot diff them by
 * reference or via `JSON.stringify`. Callers must pass the actual primitive
 * values that drive the constraints via the `deps` parameter so the effect
 * re-subscribes whenever those values change.
 *
 * @template T - Shape of a single collection document (extends DocumentData)
 * @param collectionName - Firestore top-level collection name (e.g. `'teams'`)
 * @param constraints    - Optional array of Firestore `QueryConstraint`s
 *                         (where, orderBy, limit, etc.)
 * @param deps           - Primitive values used inside `constraints`; the hook
 *                         re-subscribes whenever any entry in this array changes.
 *                         Pass every field name, operator value, and filter value
 *                         that appears in your constraints.
 * @returns Object with:
 *   - `data`    – Array of typed documents (empty array while loading)
 *   - `loading` – `true` until the first snapshot is received
 *   - `error`   – Any Firestore error, or `null` if no error has occurred
 */
export function useCollection<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = []
): { data: T[]; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Build the Firestore query from the collection reference and constraints
    const q = query(collection(db, collectionName), ...constraints);

    // Subscribe to real-time updates; onSnapshot returns an unsubscribe function
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as unknown as T)
        );
        setData(docs);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe from real-time listener when component unmounts
    // or when collectionName / deps change
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, ...deps]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// useDocument
// ---------------------------------------------------------------------------

/**
 * Subscribes to a single Firestore document with real-time updates.
 *
 * Returns `null` (not an error) when the document does not exist in Firestore,
 * mirroring the behaviour of `DocumentSnapshot.exists()`.
 *
 * If `docId` is `null` or `undefined` (e.g. a route param that hasn't loaded
 * yet), the hook short-circuits immediately: `data` is `null`, `loading` is
 * `false`, and no Firestore subscription is created.
 *
 * @template T - Shape of the document (extends DocumentData)
 * @param collectionName - Firestore top-level collection name
 * @param docId          - Firestore document ID, or `null`/`undefined` to skip
 * @returns Object with:
 *   - `data`    – Typed document, or `null` if not found / not yet requested
 *   - `loading` – `true` until the first snapshot is received
 *   - `error`   – Any Firestore error, or `null` if no error has occurred
 */
export function useDocument<T extends DocumentData>(
  collectionName: string,
  docId: string | null | undefined
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Skip subscription when docId is absent — avoids a Firestore error for
    // empty path segments and lets callers pass optional route params directly
    if (!docId) {
      setData(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, collectionName, docId);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        // exists() is false when the document has been deleted or never created
        setData(
          snapshot.exists()
            // Double-cast via unknown for the same reason as useCollection above
            ? ({ id: snapshot.id, ...snapshot.data() } as unknown as T)
            : null
        );
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe on unmount or when collection / docId changes
    return unsubscribe;
  }, [collectionName, docId]);

  return { data, loading, error };
}
