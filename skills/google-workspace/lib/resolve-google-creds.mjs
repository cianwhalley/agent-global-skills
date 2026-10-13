import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

import { getRegistryEntry } from './registry.mjs';

const CRED_DIR = resolve(homedir(), '.config/claude-skills/credentials');

function resolveCredPath(filename) {
  const envMap = {
    'connected-tutors-google-token.json': process.env.CONNECTED_TUTORS_GOOGLE_TOKEN_PATH,
    'connected-tutors-google-oauth-client.json':
      process.env.CONNECTED_TUTORS_GOOGLE_CLIENT_PATH,
    'connected-tutors-workspace-admin-token.json':
      process.env.CONNECTED_TUTORS_WORKSPACE_ADMIN_TOKEN_PATH,
    'ganttsy-google-token.json': process.env.GANTTSY_GOOGLE_TOKEN_PATH,
  };
  const fromEnv = envMap[filename];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return resolve(CRED_DIR, filename);
}

/**
 * Resolve registry id → absolute token/client paths.
 */
export function resolveGoogleCreds(registryId) {
  const entry = getRegistryEntry(registryId);
  const tokenPath = resolveCredPath(entry.tokenFile);
  const clientPath = resolveCredPath(entry.clientFile);
  if (!existsSync(tokenPath)) {
    const authHint =
      registryId === 'connected-tutors-workspace-admin'
        ? 'node ~/.claude/skills/google-workspace/scripts/auth-workspace-admin.mjs --listen'
        : 'node ~/.claude/skills/google-workspace/scripts/auth-connected-tutors-google.mjs';
    throw new Error(`Token file missing for ${registryId}: ${tokenPath}. Run: ${authHint}`);
  }
  if (!existsSync(clientPath)) {
    throw new Error(`OAuth client file missing for ${registryId}: ${clientPath}`);
  }
  return {
    ...entry,
    tokenPath,
    clientPath,
  };
}

export function readTokenFile(registryId) {
  const { tokenPath } = resolveGoogleCreds(registryId);
  return JSON.parse(readFileSync(tokenPath, 'utf8'));
}

export function readClientFile(registryId) {
  const { clientPath } = resolveGoogleCreds(registryId);
  const raw = JSON.parse(readFileSync(clientPath, 'utf8'));
  return raw.installed ?? raw.web ?? raw;
}
