# Google Drive OAuth2 Setup

## Overview

The bylaws PDF upload endpoint (`api/upload-to-drive.js`) and the weekly standings
download script (`scripts/download-weekly-standings.js`) authenticate to Google Drive
as the league Google account using OAuth2 with a stored refresh token.

Service accounts cannot create files in personal Google Drives (they have no Drive
storage quota), so OAuth2 is required instead of a service account for Drive operations.

---

## Prerequisites

- Access to [Google Cloud Console](https://console.cloud.google.com) for the league project
- The league Google account credentials (you must sign in as this account during the consent step)

---

## Step 1 — Enable the Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select the league project (or create one)
3. Navigate to **APIs & Services → Library**
4. Search **"Google Drive API"** → click it → click **Enable**

---

## Step 2 — Create an OAuth2 Client

1. Navigate to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. If prompted, configure the OAuth consent screen first:
   - User Type: **Internal** (only league Google account users)
   - App name: "Late Night Happy Hour League" (or similar)
   - No scopes need to be added in the consent screen config — the script requests them at runtime
4. Back on **Create OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Name: "League Site Local Script"
   - Under **Authorized redirect URIs**, click **Add URI** and enter:
     ```
     http://localhost:3000/oauth2callback
     ```
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** shown in the dialog

---

## Step 3 — Configure .env

Add to your `.env` (and `.env.local` if using `vercel dev`):

```
GOOGLE_OAUTH_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<your-client-secret>
```

---

## Step 4 — Run the Token Script

```
npm run oauth-token
```

Or directly:

```
node scripts/get-google-refresh-token.js
```

The script will:
1. Open your browser to the Google consent screen
2. Wait on a local server (port 3000) for the OAuth callback
3. Exchange the authorization code for tokens
4. Print `GOOGLE_OAUTH_REFRESH_TOKEN=<token>` to the terminal

**Important:** When the consent screen appears, sign in with the **league Google account**,
not your personal account. The token authorizes Drive access as whichever account completes
the consent flow — it must be the account that owns the Drive folders.

---

## Step 5 — Save the Token

Copy the printed token into `.env`:

```
GOOGLE_OAUTH_REFRESH_TOKEN=<printed-token>
```

Also add it to **Vercel project settings** (Settings → Environment Variables → Production)
so `api/upload-to-drive.js` can use it in production.

---

## Troubleshooting

### No refresh_token in response

Google only returns a `refresh_token` when consent is freshly granted. If this OAuth
client was previously authorized, the token was already issued and won't be re-sent.

Fix: revoke the app's access at https://myaccount.google.com/permissions, then run the
script again. The consent screen will appear fresh and a new refresh token will be returned.

### Port 3000 already in use

The script uses port 3000 to match the redirect URI registered in Cloud Console.
Stop whatever is running on that port (e.g., the Vite dev server) before running the script.

### Error 400: redirect_uri_mismatch

The redirect URI in Cloud Console must exactly match `http://localhost:3000/oauth2callback`.
Common causes: trailing slash, `https` instead of `http`, missing path segment.

### Token expires or stops working

Refresh tokens are long-lived but can be invalidated if:
- You revoke access in Google account settings
- The OAuth client is deleted or disabled in Cloud Console
- The league Google account password is changed (in some cases)

If the token stops working, run the script again to generate a new one and update both
`.env` and the Vercel environment variable.
