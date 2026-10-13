#!/usr/bin/env node
/**
 * Delete a Gmail draft by id (laptop / host token path).
 *
 * Usage:
 *   node delete-gmail-draft.mjs --draft-id DRAFT_ID [--registry connected-tutors-google]
 */
import https from 'https';

import { getAccessToken } from '../lib/access-token.mjs';

function parseArgs(argv) {
  const out = { registry: 'connected-tutors-google' };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--registry') {
      out.registry = val;
      i++;
      continue;
    }
    if (key === '--draft-id') {
      out.draftId = val;
      i++;
      continue;
    }
    if (key.startsWith('--')) i++;
  }
  return out;
}

function gmailDelete(accessToken, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const args = parseArgs(process.argv);
if (!args.draftId) {
  console.error('Usage: delete-gmail-draft.mjs --draft-id DRAFT_ID');
  process.exit(1);
}

const accessToken = await getAccessToken(args.registry);
const { status, body } = await gmailDelete(
  accessToken,
  `/gmail/v1/users/me/drafts/${encodeURIComponent(args.draftId)}`,
);
if (status >= 400) {
  console.error(body || `HTTP ${status}`);
  process.exit(1);
}
console.log(JSON.stringify({ deleted: args.draftId, ok: true }, null, 2));
