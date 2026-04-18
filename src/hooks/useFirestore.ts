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
 * The dependency array for the inner `useEffect` serialises the constraint
 * types to a stable string so React only re-subscribes when the set of
 * constraint kinds actually changes. Note: if you need referential stability
 * on deeply changing constraint values, wrap the constraints array in
 * `useMemo` at the call site.
 *
 * @template T - Shape of a single collection document (extends DocumentData)
 * @param collectionName - Firestore top-level collection name (e.g. `'teams'`)
 * @param constraints    - Optional array of Firestore `QueryConstraint`s
 *                         (where, orderBy, limit, etc.)
 * @returns Object with:
 *   - `data`    – Array of typed documents (empty array while loading)
 *   - `loading` – `true` until the first snapshot is received
 *   - `error`   – Any Firestore error, or `null` if no error has occurred
 */
export function useCollection<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = []
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
        // Map each DocumentSnapshot to a typed object, injecting the doc id
        const docs = snapshot.docs.map(
          // Double-cast via unknown: DocumentData is a plain object record, but
          // TypeScript cannot verify structural overlap with the generic T without it
          (d) => ({ id: d.id, ...d.data() } as unknown as T)
        );
        setData(docs);
        setLoading(false);
      },
      (err) => {
        // Capture the Firestore error without crashing the component tree
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe from real-time listener when component unmounts
    // or when collectionName / constraints change
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(constraints.map((c) => c.type))]);

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
