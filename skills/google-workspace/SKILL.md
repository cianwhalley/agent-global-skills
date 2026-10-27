---
name: google-workspace
description: >-
  Google Workspace for Connected Tutors (hello@connectedtutors.org) — Gmail,
  Calendar, Drive, Sheets, Docs. Primary auth is Agent Vault ct-hello-vault
  (CONNECTED_TUTORS_GOOGLE_OAUTH) via agent-vault run; local token files are
  secondary/legacy. Pair with MCP in connected-tutoring/.cursor/mcp.json.
---

# Google Workspace (Connected Tutors)

Account: **`hello@connectedtutors.org`**.

## Auth (primary): Agent Vault

Live OAuth is **`CONNECTED_TUTORS_GOOGLE_OAUTH`** in vault **`ct-hello-vault`** on `cleo`. MITM injects the access token — do **not** add `Authorization:` yourself, and do **not** dual-refresh from host/laptop token files.

```bash
# From connected-tutoring repo (works on Cian’s and Christina’s laptops once set up)
source scripts/vault-env.sh
vault_run curl -sS -o /dev/null -w '%{http_code}\n' \
  'https://gmail.googleapis.com/gmail/v1/users/me/labels?maxResults=1'
# expect 200
```

Or without the helper:

```bash
export AGENT_VAULT_ADDR=http://cleo:14321
export AGENT_VAULT_VAULT=ct-hello-vault
# Mac Keychain first; VPS uses the disk file.
if security find-generic-password -s 'agent-vault.ct-hello-vault' -a 'token' >/dev/null 2>&1; then
  export AGENT_VAULT_TOKEN="$(security find-generic-password -s 'agent-vault.ct-hello-vault' -a 'token' -w | tr -d '[:space:]')"
elif security find-generic-password -s 'agent-vault.silas-spike' -a 'token' >/dev/null 2>&1; then
  export AGENT_VAULT_TOKEN="$(security find-generic-password -s 'agent-vault.silas-spike' -a 'token' -w | tr -d '[:space:]')"
elif [[ -f ~/.config/agent-vault/agent-ct-hello-vault.token ]]; then
  export AGENT_VAULT_TOKEN="$(tr -d '[:space:]' < ~/.config/agent-vault/agent-ct-hello-vault.token)"
else
  export AGENT_VAULT_TOKEN="$(tr -d '[:space:]' < ~/.config/agent-vault/agent-silas-spike.token)"
fi
agent-vault run -- curl -sS …
```

Full laptop + Christina setup: **`connected-tutoring/playbooks/christina-laptop-vault.md`** and **`.claude/skills/agent-vault/SKILL.md`**.  
Global keystore rules: **`~/.claude/skills/secrets/SKILL.md`**.  
Silas playbook: `silas-agent/playbooks/ct-google.md`.

Do **not** use Cleo’s `GOOGLE_OAUTH` / `ctci-vault` for hello@.
Do **not** dual-refresh disk token files + vault for the same account.

## Workspace Admin (create teacher users) — laptop only

Creating `firstname@connectedtutors.org` uses a **separate** laptop Admin Directory token in the Mac keychain (`google-oauth.workspace-admin` / `token-json`). Never put it in Silas or Agent Vault. The listen script reads the shared OAuth client from keychain (`google-oauth.workspace-client` / `installed-json`) and writes the admin token back to the keychain. Do not recreate the client JSON on disk.

```bash
node ~/.claude/skills/google-workspace/scripts/auth-workspace-admin.mjs --listen
```

Provision CLI: `connected-tutoring/.claude/skills/workspace-admin/SKILL.md`.

## When to Use

- Gmail search, draft, send (MCP or `send-email.mjs` if local token still works)
- Calendar list/create/update (MCP)
- Drive / Sheets REST via `vault_run curl` (preferred when local token is revoked)
- Google Meet standing spaces (`meetings.space.created` — re-auth in vault if missing; enable Meet API on GCP project `openclaw-access-487720` first)

**Not** for doc sync — use the separate `google-sync` skill (different OAuth app).

## Local token files (secondary / MCP)

The shared Google OAuth **client** JSON is not on disk. Day-to-day hello@ mail uses the vault above. Do not recreate `connected-tutors-google-oauth-client.json`. A new vault's Google connect is the **secrets** skill, which reads the client from Keychain.

Some older scripts still look for a mailbox token file:

| File | Path |
|------|------|
| Token | `~/.config/claude-skills/credentials/connected-tutors-google-token.json` |

Registry id: `connected-tutors-google`.

If `access-token.mjs` / refresh fails with **`invalid_grant` / revoked**, **stop** — use vault. Do not re-run laptop OAuth listen unless the user explicitly wants a local token again (and understands vault is the shared source of truth). Local listen scripts that expect the client JSON on disk will fail; leave them that way.

## Re-connect (vault — preferred)

1. Open `http://cleo:14321` → vault **ct-hello-vault**.
2. Reconnect **`CONNECTED_TUTORS_GOOGLE_OAUTH`** as `hello@connectedtutors.org`.
3. Prove Gmail HTTP 200 via `vault_run` as above.

## Re-auth (local laptop — only if asked)

Do not. Reconnect in the vault. The listen script still expects a client JSON file that has been removed:

```bash
node ~/.claude/skills/google-workspace/scripts/auth-connected-tutors-google.mjs --listen
```

## Scripts

### Access token from disk (legacy)

```bash
node ~/.claude/skills/google-workspace/lib/access-token.mjs connected-tutors-google
```

Prefer vault MITM for REST. Prefer MCP for interactive Gmail/Calendar in Cursor when configured.

### Standing tutor Meet rooms

Do **not** use Meet API `spaces.create`. Create a Calendar series on hello@
**Meeting Rooms**, **paste the human cohost prompt** (Calendar guest ≠ cohost),
wait for “cohost saved,” then set the TeachWorks Location Link. Full checklist
+ prompt text:
`connected-tutoring/business-process/teachworks/meet-rooms.md`.

```bash
source /path/to/connected-tutoring/scripts/vault-env.sh
vault_run -- node ~/.claude/skills/google-workspace/bin/create-tutor-calendar-meet.mjs --tutor kimberly
```

(`create-tutor-meet-spaces.mjs` is retired.)

### Send email / draft

```bash
node ~/.claude/skills/google-workspace/bin/send-email.mjs \
  --to tutor@example.com \
  --subject "Reminder" \
  --body "Your session is tomorrow."
```

Confirm with the user before sending from `hello@`. Draft helper: `create-gmail-draft.mjs`. Schedule confirmations: `orders-mvp/tools/draft_schedule_email.py`.

## MCP (connected-tutoring project only)

Project `.cursor/mcp.json` wires `calendar` and `gmail`. Install once:

```bash
npm install -g @cocal/google-calendar-mcp@2.6.1 @gongrzhe/server-gmail-autoauth-mcp@1.1.11
```

Restart Cursor after MCP config changes. If MCP auth fails because the local refresh token is revoked, use vault REST or reconnect in vault and (only if needed) refresh local files per user request.
