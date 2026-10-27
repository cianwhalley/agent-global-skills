/**
 * Agent Vault MITM helpers for Connected Tutors Google CLIs / inline Node.
 *
 * When a process runs under `agent-vault run` / `vault_run` (ct-hello-vault),
 * HTTPS is proxied and CONNECTED_TUTORS_GOOGLE_OAUTH is injected. Do **not**
 * refresh or send a local Bearer token — dual-refresh fights the vault.
 *
 * Detect: AGENT_VAULT_TOKEN + HTTPS_PROXY/HTTP_PROXY (set by agent-vault run).
 * Override: CT_GOOGLE_VAULT_MITM=1 force on, =0 force off.
 *
 * orders-mvp `node_google_auth_preamble()` imports `isVaultMode` + `vaultModeHint`.
 */

export function isAgentVaultMitm() {
  const flag = (process.env.CT_GOOGLE_VAULT_MITM || '').trim();
  if (flag === '1' || flag.toLowerCase() === 'true') return true;
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  return Boolean(
    process.env.AGENT_VAULT_TOKEN &&
      (process.env.HTTPS_PROXY || process.env.HTTP_PROXY),
  );
}

/** Alias used by orders-mvp inline Node snippets. */
export function isVaultMode() {
  return isAgentVaultMitm();
}

export function vaultModeHint() {
  return (
    'Source connected-tutoring/scripts/vault-env.sh and run under vault_run ' +
    '(ct-hello-vault / CONNECTED_TUTORS_GOOGLE_OAUTH). ' +
    'Do not refresh local ~/.config/claude-skills/credentials/connected-tutors-google-token.json.'
  );
}

/**
 * Headers for Google REST. Under vault MITM: no Authorization (broker injects).
 * Otherwise: Bearer from getAccessToken(registryId).
 */
export async function googleAuthHeaders(getAccessToken, registryId, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (isAgentVaultMitm()) {
    return headers;
  }
  const token = await getAccessToken(registryId);
  headers.Authorization = `Bearer ${token}`;
  return headers;
}
