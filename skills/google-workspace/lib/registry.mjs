/** Registry ids → token/client filenames under ~/.config/claude-skills/credentials/ */
export const GOOGLE_REGISTRY = {
  'connected-tutors-google': {
    id: 'connected-tutors-google',
    account: 'hello@connectedtutors.org',
    tokenFile: 'connected-tutors-google-token.json',
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
  /** Laptop-only Workspace Admin (Directory API). Never sync to Silas/vault. */
  'connected-tutors-workspace-admin': {
    id: 'connected-tutors-workspace-admin',
    account: 'workspace-admin@connectedtutors.org',
    tokenFile: 'connected-tutors-workspace-admin-token.json',
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
  'ganttsy-google': {
    id: 'ganttsy-google',
    account: 'cian@ganttsy.com',
    tokenFile: 'ganttsy-google-token.json',
    // Reuse the same desktop OAuth client as Connected Tutors (multi-account).
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
  'personal-google': {
    id: 'personal-google',
    account: 'cian4personal@gmail.com',
    tokenFile: 'personal-google-token.json',
    // Reuse the same desktop OAuth client as Connected Tutors (multi-account).
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
  'cognitivetech-google': {
    id: 'cognitivetech-google',
    account: 'cian@cognitivetech.net',
    tokenFile: 'cognitivetech-google-token.json',
    // Reuse the same desktop OAuth client as Connected Tutors (multi-account).
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
  'athyna-google': {
    id: 'athyna-google',
    account: 'cian@athynainsight.ai',
    tokenFile: 'athyna-google-token.json',
    // Reuse the same desktop OAuth client as Connected Tutors (multi-account).
    clientFile: 'connected-tutors-google-oauth-client.json',
  },
};

export function getRegistryEntry(registryId) {
  const entry = GOOGLE_REGISTRY[registryId];
  if (!entry) {
    throw new Error(
      `Unknown Google registry id "${registryId}". Known: ${Object.keys(GOOGLE_REGISTRY).join(', ')}`,
    );
  }
  return entry;
}
