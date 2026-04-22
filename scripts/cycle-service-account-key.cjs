/**
 * Cycles the Firebase service account key:
 * 1. Authenticates using the current key file
 * 2. Deletes the exposed/old key
 * 3. Creates a new key and writes it to the same output path
 *
 * Usage: node scripts/cycle-service-account-key.js
 *
 * Requires: google-auth-library (already in node_modules via firebase-admin)
 * Input:    service-account.json (current key — will be replaced)
 * Output:   service-account.json (new key written in-place)
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const KEY_FILE = path.resolve(__dirname, '..', 'service-account.json');
const IAM_BASE = 'https://iam.googleapis.com/v1';

async function main() {
  const keyData = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const { client_email: serviceAccount, private_key_id: oldKeyId, project_id: projectId } = keyData;
  const resourceName = `projects/${projectId}/serviceAccounts/${serviceAccount}`;

  console.log(`Service account : ${serviceAccount}`);
  console.log(`Revoking key    : ${oldKeyId}`);

  const auth = new GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();

  // Delete the old (exposed) key
  const deleteUrl = `${IAM_BASE}/${resourceName}/keys/${oldKeyId}`;
  const deleteRes = await client.request({ url: deleteUrl, method: 'DELETE' });
  if (deleteRes.status !== 200) {
    throw new Error(`Delete failed: ${deleteRes.status} ${JSON.stringify(deleteRes.data)}`);
  }
  console.log('Old key revoked successfully.');

  // Create a new key
  const createUrl = `${IAM_BASE}/${resourceName}/keys`;
  const createRes = await client.request({
    url: createUrl,
    method: 'POST',
    data: { privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE', keyAlgorithm: 'KEY_ALG_RSA_2048' },
  });
  if (createRes.status !== 200) {
    throw new Error(`Create failed: ${createRes.status} ${JSON.stringify(createRes.data)}`);
  }

  // The new key JSON is base64-encoded in privateKeyData
  const newKeyJson = Buffer.from(createRes.data.privateKeyData, 'base64').toString('utf8');
  fs.writeFileSync(KEY_FILE, newKeyJson, 'utf8');

  const newKeyId = JSON.parse(newKeyJson).private_key_id;
  console.log(`New key created : ${newKeyId}`);
  console.log(`Written to      : ${KEY_FILE}`);
  console.log('\nDone. Update FIREBASE_SERVICE_ACCOUNT_PATH in .env if needed (path unchanged).');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
