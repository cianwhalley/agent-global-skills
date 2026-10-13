#!/usr/bin/env node
/**
 * Refresh Google OAuth access token for a registry id.
 *
 * Usage:
 *   node scripts/oauth-refresh.mjs [connected-tutors-google]
 */
import { getAccessToken } from '../lib/access-token.mjs';
import { readTokenFile, resolveGoogleCreds } from '../lib/resolve-google-creds.mjs';
import { tokenExpiresAt } from '../lib/normalize-token.mjs';

const registryId = process.argv[2] || 'connected-tutors-google';

try {
  const { account, tokenPath } = resolveGoogleCreds(registryId);
  await getAccessToken(registryId, { cacheMs: 0 });
  const token = readTokenFile(registryId);
  const expiresAt = tokenExpiresAt(token);
  const mins = expiresAt
    ? Math.max(0, Math.round((expiresAt - Math.floor(Date.now() / 1000)) / 60))
    : '?';
  console.log(`Refreshed ${registryId} (${account ?? 'unknown account'})`);
  console.log(`Token file: ${tokenPath}`);
  console.log(`Expires in ~${mins} minutes`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
