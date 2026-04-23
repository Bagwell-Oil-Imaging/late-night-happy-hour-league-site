/**
 * @fileoverview One-time script to obtain a Google OAuth2 refresh token for
 * Drive uploads. Run this once; paste the resulting refresh token into .env
 * and the Vercel dashboard as GOOGLE_OAUTH_REFRESH_TOKEN.
 *
 * Prerequisites:
 *   1. In Google Cloud Console → APIs & Services → Credentials, create an
 *      OAuth 2.0 Client ID (Application type: "Desktop app").
 *   2. Download the JSON and note the client_id and client_secret.
 *   3. Set those values in .env:
 *        GOOGLE_OAUTH_CLIENT_ID=<your-client-id>
 *        GOOGLE_OAUTH_CLIENT_SECRET=<your-client-secret>
 *   4. Run: node scripts/get-drive-oauth-token.cjs
 *   5. Open the printed URL in a browser, sign in as the LEAGUE Google account,
 *      approve the Drive permission.
 *   6. Google redirects to localhost (will fail to load — that's fine). Copy
 *      the `code=` value from the URL.
 *   7. Paste the code into the terminal prompt.
 *   8. The script prints the refresh token. Add it to .env and Vercel.
 *
 * This script only needs to be run once. The refresh token does not expire
 * unless access is revoked in the Google account's security settings.
 */

'use strict';

const { google } = require('googleapis');
const readline = require('readline');
require('dotenv/config');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '\nError: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env\n' +
    '  1. Create a Desktop OAuth2 client at https://console.cloud.google.com/apis/credentials\n' +
    '  2. Add the values to .env, then re-run this script.\n'
  );
  process.exit(1);
}

// Use the same redirect URI Google uses for desktop/CLI flows.
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Request offline access so we get a refresh token (not just an access token).
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n=== Google Drive OAuth2 Token Setup ===\n');
console.log('1. Open this URL in a browser and sign in as the LEAGUE Google account:\n');
console.log('   ' + authUrl);
console.log('\n2. Approve the Drive permission.');
console.log('3. Copy the authorization code shown on the page.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();

  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());

    if (!tokens.refresh_token) {
      console.error(
        '\nNo refresh token in response. This can happen if the account already\n' +
        'granted access. Revoke access at https://myaccount.google.com/permissions\n' +
        'then re-run this script.\n'
      );
      process.exit(1);
    }

    console.log('\n=== Success! Add this to .env and the Vercel dashboard ===\n');
    console.log('GOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nVercel command to add it to production:');
    console.log(
      `  echo "${tokens.refresh_token}" | vercel env add GOOGLE_OAUTH_REFRESH_TOKEN production --force`
    );
    console.log('\nAlso add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to Vercel if not done yet.\n');
  } catch (err) {
    console.error('\nFailed to exchange code for tokens:', err.message, '\n');
    process.exit(1);
  }
});
