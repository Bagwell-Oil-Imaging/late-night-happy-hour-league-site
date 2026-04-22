/**
 * @file firebase.ts
 * @module firebase
 *
 * Firebase application initialization module.
 *
 * Initializes the Firebase app with environment-provided configuration and
 * exports singleton instances of the Firestore database and Firebase Auth
 * clients for use across the application.
 *
 * Note: Firebase Storage is intentionally NOT initialized here. Bylaws PDFs
 * and other file assets are served from Google Drive (via driveFileId stored
 * in Firestore). The Vercel serverless endpoint at api/upload-to-drive.js
 * handles all file uploads server-side.
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Firebase project configuration.
 * All values are injected at build time via Vite's import.meta.env mechanism.
 * Copy .env.example to .env and supply your Firebase project's values.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Singleton Firebase app instance */
const app = initializeApp(firebaseConfig);

/**
 * Firestore database client.
 * Use this to read and write all 12 Firestore collections.
 */
export const db = getFirestore(app);

/**
 * Firebase Auth client.
 * Used by the admin panel for email/password authentication.
 */
export const auth = getAuth(app);
