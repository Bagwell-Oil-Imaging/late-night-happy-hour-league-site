/**
 * @fileoverview Obtains a Google OAuth2 refresh token for Drive uploads.
 *
 * Starts a local HTTP server, opens the Google consent page in the default
 * browser, captures the auth code from the redirect, exchanges it for tokens,
 * and writes the new GOOGLE_OAUTH_REFRESH_TOKEN directly into .env.
 *
 * Usage:  node scripts/get-drive-oauth-token.cjs
 *
 * Prerequisites: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must
 * already be set in .env (they have not changed — only the refresh token expired).
 */

'use strict';

const { google } = require('googleapis');
const http = require('http');
const { exec } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
require('dotenv/config');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 9876;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const ENV_PATH = join(__dirname, '..', '.env');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'select_account consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

// Spin up a one-shot local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') return;

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`OAuth error: ${error || 'no code returned'}`);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>✓ Authorized. You can close this tab.</h2>');
  server.close();

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error(
        '\nNo refresh token returned. The account may still have active access.\n' +
        'Revoke it at https://myaccount.google.com/permissions then re-run.\n'
      );
      process.exit(1);
    }

    // Write the new token into .env, replacing the old value
    let env = readFileSync(ENV_PATH, 'utf8');
    if (env.includes('GOOGLE_OAUTH_REFRESH_TOKEN=')) {
      env = env.replace(/GOOGLE_OAUTH_REFRESH_TOKEN=.*/m, `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      env += `\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    writeFileSync(ENV_PATH, env);

    console.log('\n✓ Refresh token saved to .env');
    console.log(`  GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token.slice(0, 20)}...`);
    console.log('\nRun "npm run standings" to upload PDFs to Drive.\n');
  } catch (err) {
    console.error('\nFailed to exchange code for tokens:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nOpening Google authorization page in your browser...`);
  // Open the default browser on Windows
  exec(`start "" "${authUrl}"`);
  console.log('Sign in as the LEAGUE Google account and approve Drive access.');
  console.log('(If the browser did not open, visit this URL manually:)');
  console.log(`\n  ${authUrl}\n`);
});
