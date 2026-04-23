/**
 * Tests Google Drive API connection using the service account and lists
 * all files/folders the service account can see.
 *
 * Usage: node scripts/test-drive-connection.cjs
 */

const { google } = require('googleapis');
const path = require('path');

const KEY_FILE = path.resolve(__dirname, '..', 'service-account.json');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    fields: 'files(id, name, mimeType, parents)',
    pageSize: 50,
  });

  const files = res.data.files;
  if (!files || files.length === 0) {
    console.log('No files found. Make sure the folder is shared with the service account.');
    return;
  }

  console.log('Files/folders accessible to service account:\n');
  files.forEach(f => {
    const type = f.mimeType === 'application/vnd.google-apps.folder' ? '[FOLDER]' : '[FILE]  ';
    console.log(`${type} ${f.name}`);
    console.log(`         ID: ${f.id}`);
    if (f.parents) console.log(`         Parent: ${f.parents[0]}`);
    console.log();
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
