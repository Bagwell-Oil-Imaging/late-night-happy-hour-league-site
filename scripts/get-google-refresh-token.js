/**
 * get-google-refresh-token.js
 *
 * One-time setup script: generates a Google OAuth2 refresh token for the league
 * Google account. The token is required by:
 *   - api/upload-to-drive.js                   (bylaws PDF uploads)
 *   - scripts/download-weekly-standings.js      (Drive folder access)
 *
 * How it works:
 *   1. Reads GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET from .env
 *   2. Opens a browser to the Google consent screen
 *   3. Starts a local server on port 3000 to capture the OAuth callback
 *   4. Exchanges the authorization code for tokens
 *   5. Prints GOOGLE_OAUTH_REFRESH_TOKEN=<token> — copy it to .env and Vercel
 *
 * Prereqs:
 *   - GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET set in .env
 *   - Google Drive API enabled in Google Cloud Console
 *   - OAuth client type: Web application
 *   - Authorized redirect URI added: http://localhost:3000/oauth2callback
 *
 * See docs/runbooks/google-drive-oauth.md for full setup instructions.
 *
 * Usage:   node scripts/get-google-refresh-token.js
 *          npm run oauth-token
 */

import { createServer } from 'http'
import { exec } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// Load .env then let .env.local override — matches Vite's convention
loadEnv({ path: join(ROOT, '.env') })
loadEnv({ path: join(ROOT, '.env.local'), override: true })

/** Port must match the redirect URI registered in Google Cloud Console. */
const PORT = 3000
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

/**
 * Drive scope — grants read/write access to files the app creates.
 * Narrower than `drive` (full access); sufficient for upload and folder ops.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive'

const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET } = process.env

if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
  console.error(
    '\nError: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env\n' +
    'See docs/runbooks/google-drive-oauth.md for setup instructions.'
  )
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT_URI
)

/**
 * prompt: 'consent' forces the consent screen to appear even if access was
 * previously granted. Without it, Google only returns a refresh_token on the
 * very first authorization — subsequent flows omit it.
 */
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPE,
  prompt: 'consent',
})

/**
 * Open a URL in the system's default browser, cross-platform.
 * Prints the URL to stdout if the open command fails so the user can open it manually.
 *
 * @param {string} url
 */
function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`

  exec(cmd, (err) => {
    if (err) {
      console.log('Could not open browser automatically. Open this URL manually:\n')
      console.log(url + '\n')
    }
  })
}

/**
 * Spin up a one-shot HTTP server on PORT to receive the OAuth2 callback.
 * Closes the server immediately after receiving the first valid code or error.
 *
 * @returns {Promise<string>} Resolves with the authorization code.
 */
function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`Authorization failed: ${error}. You can close this tab.`)
        server.close()
        reject(new Error(`OAuth error from Google: ${error}`))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Authorization successful! You can close this tab and return to the terminal.')
        server.close()
        resolve(code)
      }
    })

    server.listen(PORT, () => {
      console.log(`Waiting for Google to redirect to http://localhost:${PORT}/oauth2callback...\n`)
    })

    server.on('error', (err) => {
      reject(new Error(
        `Could not start local server on port ${PORT}: ${err.message}\n` +
        'Make sure nothing else is running on that port (e.g. the Vite dev server).'
      ))
    })
  })
}

/**
 * Main flow: build auth URL → open browser → wait for callback → exchange code → print token.
 */
async function main() {
  console.log('\nGoogle OAuth2 Refresh Token Generator')
  console.log('======================================')
  console.log(
    `\nPrerequisite: http://localhost:${PORT}/oauth2callback must be listed as an\n` +
    'Authorized redirect URI in your Google Cloud Console OAuth client.\n' +
    'See docs/runbooks/google-drive-oauth.md if you have not set this up yet.\n'
  )
  console.log('Opening browser for Google consent...')

  openBrowser(authUrl)

  let code
  try {
    code = await waitForAuthCode()
  } catch (err) {
    console.error(`\nFailed to receive authorization code: ${err.message}`)
    process.exit(1)
  }

  console.log('Authorization code received. Exchanging for tokens...')

  let tokens
  try {
    ;({ tokens } = await oauth2Client.getToken(code))
  } catch (err) {
    console.error(`\nToken exchange failed: ${err.message}`)
    process.exit(1)
  }

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token in the response from Google.\n' +
      'This happens when this OAuth client was previously authorized without the consent prompt.\n' +
      'Fix: revoke access at https://myaccount.google.com/permissions then run this script again.'
    )
    process.exit(1)
  }

  console.log('\n---')
  console.log('Add the following line to .env and to Vercel project settings:\n')
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log('\n---\nDone.\n')
}

main()
