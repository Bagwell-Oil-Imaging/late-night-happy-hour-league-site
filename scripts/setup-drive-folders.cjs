/**
 * Creates the League Site folder structure in Google Drive under the
 * shared root folder. Safe to re-run — skips folders that already exist.
 *
 * Usage: node scripts/setup-drive-folders.cjs
 */

const { google } = require('googleapis');
const path = require('path');

const KEY_FILE = path.resolve(__dirname, '..', 'service-account.json');
const ROOT_FOLDER_ID = '1FTQPMv5qK8aWYtgVgu2KqSHc6sSkCyg_';

const STRUCTURE = {
  bylaws: [],
  assets: ['carousel', 'general'],
  '2024-2025': ['weekly-reports', 'team-photos', 'images'],
  '2025-2026': ['weekly-reports', 'team-photos', 'images'],
};

async function getOrCreateFolder(drive, name, parentId) {
  // Check if folder already exists under this parent
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });

  if (res.data.files.length > 0) {
    console.log(`  [exists]  ${name} (${res.data.files[0].id})`);
    return res.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
  });

  console.log(`  [created] ${name} (${created.data.id})`);
  return created.data.id;
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  console.log(`Building folder structure under root: ${ROOT_FOLDER_ID}\n`);

  const folderIds = { root: ROOT_FOLDER_ID };

  for (const [topLevel, children] of Object.entries(STRUCTURE)) {
    console.log(`${topLevel}/`);
    const topId = await getOrCreateFolder(drive, topLevel, ROOT_FOLDER_ID);
    folderIds[topLevel] = topId;

    for (const child of children) {
      console.log(`  ${topLevel}/${child}/`);
      const childId = await getOrCreateFolder(drive, child, topId);
      folderIds[`${topLevel}/${child}`] = childId;
    }
  }

  console.log('\nFolder IDs (save these to .env):\n');
  for (const [key, id] of Object.entries(folderIds)) {
    console.log(`DRIVE_FOLDER_${key.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}=${id}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
