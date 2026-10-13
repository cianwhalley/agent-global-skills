#!/usr/bin/env node
/**
 * Send an existing Gmail draft by id (laptop / host token path).
 *
 * Usage:
 *   node send-gmail-draft.mjs --draft-id DRAFT_ID [--registry connected-tutors-google]
 */
import https from 'https';

import { getAccessToken } from '../lib/access-token.mjs';
import { googleAuthHeaders } from '../lib/vault-mode.mjs';

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

function gmailPost(authHeaders, path, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path,
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, body: { raw: data } });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const args = parseArgs(process.argv);
if (!args.draftId) {
  console.error('Usage: send-gmail-draft.mjs --draft-id DRAFT_ID');
  process.exit(1);
}

const authHeaders = await googleAuthHeaders(getAccessToken, args.registry);
const { status, body } = await gmailPost(authHeaders, '/gmail/v1/users/me/drafts/send', {
  id: args.draftId,
});
if (status >= 400 || body.error) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify(
    { id: body.id, threadId: body.threadId, labelIds: body.labelIds || [] },
    null,
    2,
  ),
);
