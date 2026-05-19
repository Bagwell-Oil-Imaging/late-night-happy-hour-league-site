---
feature: Google OAuth2 Setup
number: 23
source-paths:
  - scripts/get-google-refresh-token.js
---

## Intent

One-time developer script that walks through the Google OAuth2 consent flow and
prints a `GOOGLE_OAUTH_REFRESH_TOKEN` value. Required before Drive uploads or
Drive folder access will work in any environment.

## Key Behaviors

- Reads `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` from `.env`
- Opens the system browser to Google's consent screen
- Spins up a local HTTP server on port 3000 to receive the OAuth callback
- Exchanges the authorization code for tokens via `googleapis`
- Prints the `GOOGLE_OAUTH_REFRESH_TOKEN` value to stdout; does not write it to disk
- Forces `prompt: 'consent'` so a refresh token is always returned, even if access was previously granted

## Conditional Paths

- If `GOOGLE_OAUTH_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_SECRET` are missing from `.env` → exits with an error and a pointer to the runbook
- If the browser cannot be opened automatically → prints the auth URL to stdout for manual navigation
- If port 3000 is in use → server fails to start with an actionable error message
- If Google returns an OAuth error (e.g., user denied consent) → exits with the error message
- If no `refresh_token` in the response (access previously granted without consent prompt) → exits with instructions to revoke and retry

## External Dependencies

- `googleapis` npm package (already installed)
- `dotenv` npm package (already installed)
- Google Cloud Console project with Drive API enabled and an OAuth2 Web application client configured
- Authorized redirect URI `http://localhost:3000/oauth2callback` registered in the OAuth client

## Known Issues

None

## Notes

Run via `npm run oauth-token` or `node scripts/get-google-refresh-token.js`.

The generated token must be added to:
1. `.env` locally — for `vercel dev` and local script runs
2. Vercel project environment variables — for `api/upload-to-drive.js` in production

Full setup instructions: `docs/runbooks/google-drive-oauth.md`
