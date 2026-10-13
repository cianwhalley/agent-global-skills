#!/usr/bin/env node
/**
 * Return a valid access token for a Google OAuth registry id.
 * Refreshes on demand when expired (laptop/local use).
 */
import { writeFileSync } from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';

import { normalizeOAuthTokenShape, tokenExpiresAt } from './normalize-token.mjs';
import { readClientFile, readTokenFile, resolveGoogleCreds } from './resolve-google-creds.mjs';

const cache = new Map();

function refreshAccessToken(registryId) {
  const { tokenPath } = resolveGoogleCreds(registryId);
  const client = readClientFile(registryId);
  const token = normalizeOAuthTokenShape(readTokenFile(registryId));
  const refreshToken = token.refresh_token;
  if (!refreshToken) {
    throw new Error(
      `No refresh_token for ${registryId}. Re-auth: node scripts/auth-connected-tutors-google.mjs`,
    );
  }

  const body = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const refreshed = JSON.parse(data);
            if (refreshed.error) {
              const detail =
                refreshed.error_description ?? refreshed.error ?? 'Token refresh failed';
              const hint =
                refreshed.error === 'invalid_grant' &&
                registryId === 'connected-tutors-google'
                  ? ' Local refresh token is revoked. Prefer Agent Vault silas-spike (CONNECTED_TUTORS_GOOGLE_OAUTH): source connected-tutoring/scripts/vault-env.sh && vault_run curl … — see .claude/skills/agent-vault/SKILL.md. Do not dual-refresh from disk.'
                  : refreshed.error === 'invalid_grant' &&
                      registryId === 'connected-tutors-workspace-admin'
                    ? ' Re-auth laptop-only: node ~/.claude/skills/google-workspace/scripts/auth-workspace-admin.mjs --listen (do not put this token in Silas/vault).'
                    : '';
              reject(new Error(`${detail}${hint}`));
              return;
            }
            const merged = {
              ...token,
              ...refreshed,
              refresh_token: refreshed.refresh_token ?? refreshToken,
              expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
            };
            writeFileSync(tokenPath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
            cache.delete(registryId);
            resolve(merged.access_token);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function getAccessToken(registryId, { cacheMs = 30_000, refresh = true } = {}) {
  const now = Date.now();
  const hit = cache.get(registryId);
  if (hit && now - hit.at < cacheMs) return hit.token;

  const raw = readTokenFile(registryId);
  const token = normalizeOAuthTokenShape(raw);
  const accessToken = token.access_token;
  if (!accessToken) {
    throw new Error(`No access_token in token file for ${registryId}.`);
  }

  const expiresAt = tokenExpiresAt(token);
  const nowSec = Math.floor(now / 1000);
  const nearExpiry = expiresAt !== null && expiresAt < nowSec + 60;

  if (nearExpiry) {
    if (!refresh) {
      throw new Error(
        `Google token for ${registryId} is expired. Run: node scripts/oauth-refresh.mjs ${registryId}`,
      );
    }
    const refreshed = await refreshAccessToken(registryId);
    cache.set(registryId, { token: refreshed, at: now });
    return refreshed;
  }

  cache.set(registryId, { token: accessToken, at: now });
  return accessToken;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const registryId = process.argv[2] || 'connected-tutors-google';
  getAccessToken(registryId)
    .then((token) => process.stdout.write(token))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
