---
name: secrets
description: >-
  Store and consume secrets via Agent Vault proposals and vault_run. Use when
  asking the user for an API key, storing a credential, picking ct-hello-vault vs
  coach-vault vs ct-christina-vault vs ctci-vault, or diagnosing missing tokens. Never paste secrets in chat.
---

# Secrets (Agent Vault overlay)

This install: **{{FACE}}** · vault **{{VAULT}}**

Official protocol lives in the sibling skill `agent-vault-cli` (do not list
or discover proactively; call the real URL; MITM injects; propose on 401/403).
This overlay is what official cannot know: which vault, where the **agent token**
lives, which broker URL, and CT vs Cleo key names.

## Token lookup — source vault-env, never the secret

Do **not** `security -w`, `cat` a token file, or `export AGENT_VAULT_TOKEN=…` from
chat. Source the `vault-env.sh` for the **tree you are in**. That script:

1. **Darwin Keychain** `agent-vault.<vault>` account `token` (Cian + Christina laptops)
2. Else **disk** `~/.config/agent-vault/agent-<vault>.token` (Silas/Cleo VPS)
3. `config/vault.json` `tokenFile` only overrides the disk path

`uname` is the switch, not the face name. Silas-spike on a Mac is Keychain; the
same vault on Silas VPS is the file.

| Face | Vault | Token | ADDR |
|------|-------|-------|------|
| silas (Christina laptop) | `ct-hello-vault` | Keychain `agent-vault.ct-hello-vault` / `token` | `http://cleo:14321` |
| silas (VPS) | `ct-hello-vault` | `~/.config/agent-vault/agent-ct-hello-vault.token` | `http://127.0.0.1:14321` |
| cleo (VPS) | `ctci-vault` | `~/.config/agent-vault/agent-ctci-vault.token` | `http://127.0.0.1:14321` |
| cian (laptop picker) | by product (below) | Keychain `agent-vault.<vault>` / `token` | `http://cleo:14321` |

- **This face is silas:** never use `ctci-vault`. Source connected-tutoring or silas-agent `vault-env.sh`. On a laptop, if the hub script defaulted ADDR to localhost, `export AGENT_VAULT_ADDR=http://cleo:14321`. Two switches off `ct-hello-vault`, same token: `AGENT_VAULT_VAULT=coach-vault` for `christina@christinaelaine.com`, and `AGENT_VAULT_VAULT=ct-christina-vault` for `christina@connectedtutors.org`. Set that after sourcing.
- **This face is cleo:** never use `ct-hello-vault`. Source cleo-agent `vault-env.sh`.
- **This face is cian:** picker below. Always source the hub/repo you are in so leftover sibling env is unset.

Owner password / `credential get` is **not** for agents. Proxy agent tokens only.

## Which vault? (cian face, or if this install is a picker)

If the user did not name the **vault** and the **org/product**, do not guess.

- **High certainty:** proceed, and log one sentence naming vault + credential key + why.
- **Any uncertainty:** stop and ask. “A Neon key” is uncertain. “Connected Tutors Neon API key” is not.

| High-certainty signal | Vault | Credential naming |
|-----------------------|-------|-------------------|
| Connected Tutors, tutoring repo, hello@, TeachWorks, Quo, Odyssey, CT Stripe | `ct-hello-vault` | `CONNECTED_TUTORS_*` or the CT table below |
| Coaching API keys (Stripe, Loops, `*_COACHING`) | `ct-hello-vault` | say so out loud |
| Coaching Google `christina@christinaelaine.com` | `coach-vault` | `CHRISTINA_ELAINE_GOOGLE_OAUTH` |
| Connected Tutors Google `christina@connectedtutors.org` | `ct-christina-vault` | `CT_CHRISTINA_GOOGLE_OAUTH` |
| Cian personal, Cognitive Tech, Ganttsy, CopperTeams, Cleo Google, Xero | `ctci-vault` | never a `CONNECTED_TUTORS_*` key |

Repo cwd is a hint, not a default. A generic name (`NEON_API_KEY`) is always wrong
when the vault is shared across products.

**Silas/Cleo faces skip the picker** — this install already pinned the vault. Christina's other two mailboxes are the exception on the silas face: same token, `AGENT_VAULT_VAULT=coach-vault` or `AGENT_VAULT_VAULT=ct-christina-vault`.

## Google mailboxes

`christina-laptop` is a **member** of `ct-hello-vault`, `coach-vault`, and `ct-christina-vault`. `silas` is **proxy** on `ct-hello-vault` and a **member** of the other two. No second token, and no Keychain item named `agent-vault.coach-vault` or `agent-vault.ct-christina-vault`. Token lookup is `agent-vault.ct-hello-vault` / `token` on a Mac, or `~/.config/agent-vault/agent-ct-hello-vault.token` on the VPS. `vault-env.sh` still accepts the old Keychain item `agent-vault.silas-spike` and the old file `agent-silas-spike.token` when the new name is not there yet. Cleo’s token is `agent-vault.ctci-vault`, with the same fallback to `agent-vault.cleo-spike`.

`source scripts/vault-env.sh` pins `ct-hello-vault`. Set one vault after that. `christina@christinaelaine.com` uses `coach-vault`. `christina@connectedtutors.org` uses `ct-christina-vault`.

```bash
source scripts/vault-env.sh
export AGENT_VAULT_VAULT=ct-christina-vault
```

| Mailbox | Vault | Key |
|---------|-------|-----|
| `hello@connectedtutors.org` | `ct-hello-vault` | `CONNECTED_TUTORS_GOOGLE_OAUTH` |
| `christina@christinaelaine.com` | `coach-vault` | `CHRISTINA_ELAINE_GOOGLE_OAUTH` |
| `christina@connectedtutors.org` | `ct-christina-vault` | `CT_CHRISTINA_GOOGLE_OAUTH` |

Google hosts can be bound once per vault, so these three mailboxes cannot share a vault. Each key stays bound to the mailbox in that row. `CT_CHRISTINA_GOOGLE_OAUTH` is connected as `christina@connectedtutors.org`. Reconnect in the admin UI (`http://cleo:14321`) only if that token is revoked, and only while signed in as that mailbox. The Google callback is `http://127.0.0.1:14321` on cleo, so finish consent through an SSH tunnel to that port. Do not start Connect again with an empty client secret — that wipes the stored secret. Do not connect `CT_CHRISTINA_GOOGLE_OAUTH` as hello@ or as `christina@christinaelaine.com`. `ct-christina-vault` is Google only: no Stripe, Loops, or Mercury.

## Google OAuth client (new vault only)

Mac Keychain service `google-oauth.workspace-client`, account `installed-json`. This is the shared GCP client (client id + secret), not a mailbox token. **Only this skill reads it, and only when creating a new vault's Google credential.** Day-to-day Gmail, Drive, and Calendar go through Agent Vault.

`security -w` prints hex when the value contains newlines. Decode the hex, then parse JSON. Never print it. Never write it back to disk. The disk copies are gone on purpose.

## Workspace admin token (this laptop only)

Mac Keychain service `google-oauth.workspace-admin`, account `token-json`. This is the Admin Directory refresh token that creates `firstname@connectedtutors.org`. It is not the hello@ mailbox token and it is not the GCP client above.

Laptop only. Do not copy it to Silas, Agent Vault, git, or chat. hello@ Gmail, Drive, and Calendar stay on vault `ct-hello-vault` / `CONNECTED_TUTORS_GOOGLE_OAUTH`.

Scripts read and refresh this item in memory (`google-workspace/lib/workspace-admin-keychain.mjs`). A refresh may read `google-oauth.workspace-client` in memory so it can mint a new access token. Never print either value. Never write the client JSON to disk. After a successful keychain write, delete `~/.config/claude-skills/credentials/connected-tutors-workspace-admin-token.json` if it is still there. One copy only.

Re-auth, still laptop only: `node ~/.claude/skills/google-workspace/scripts/auth-workspace-admin.mjs --listen`. That writes the keychain item, not the disk file.

## Consume

```bash
source scripts/vault-env.sh   # tree you are in; forces that vault + token lookup
vault_run curl -sS -o /dev/null -w '%{http_code}\n' \
  'https://gmail.googleapis.com/gmail/v1/users/me/labels?maxResults=1'
```

Do not add your own `Authorization` header. Do not `eval skill-env.sh --org tutoring`
without `--name` / `--name-prefix` / `--all`. Do not `vault credential list` or
`credential get`.

One-key laptop fallback (form logins / Odyssey): 

```bash
eval "$(~/.claude/scripts/skill-env.sh --org tutoring --name quo.api_key)"
eval "$(~/.claude/scripts/skill-env.sh --org tutoring --name-prefix odyssey.)"
```

## Propose a new secret

Use **agent-vault-cli** `proposal create` with `--vault` set. Never paste the value
in chat. Never `credential set` from the transcript.

1. Known-keys table below, or `vault discover --json | jq -e --arg k KEY '.available_credentials | index($k) != null'` for **one** name. Do not print the catalog.
2. Proposal CLI (see `agent-vault-cli`). Include `--host` + auth if HTTP MITM.
3. **Laptop:** rewrite approval URL `http://127.0.0.1:14321/approve/…` → `http://cleo:14321/approve/…`. **VPS:** localhost is correct — do not rewrite.
4. Wait until they say it is done. Verify: `proposal show` (status applied) + one `vault_run` HTTP 200. Not `credential list`.

## Known keys (ct-hello-vault)

| Need | Key | Host / notes |
|------|------|----------------|
| CT Google hello@ | `CONNECTED_TUTORS_GOOGLE_OAUTH` | Gmail/Drive/Sheets/Calendar |
| CT Neon Console API | `CONNECTED_TUTORS_NEON_API_KEY` | `console.neon.tech` |
| TeachWorks | `TEACHWORKS_API_KEY` | `api.teachworks.com` |
| Quo | `QUO_API_KEY` | |
| Stripe CT | `STRIPE_SECRET_KEY` | not `STRIPE_SECRET_KEY_COACHING` |
| Linear tutoring | `LINEAR_API_KEY_TUTORING` | |
| Odyssey portals | `ODYSSEY_<ST>_USERNAME` / `_PASSWORD` | form login; not MITM |

## Known keys (coach-vault)

| Need | Key | Host / notes |
|------|------|----------------|
| Coaching Google christina@ | `CHRISTINA_ELAINE_GOOGLE_OAUTH` | Gmail, Drive, Calendar, Sheets, Docs, Meet. Forms reads succeed through the Drive scope. |

## Known keys (ct-christina-vault)

| Need | Key | Host / notes |
|------|------|----------------|
| CT Google christina@ | `CT_CHRISTINA_GOOGLE_OAUTH` | `christina@connectedtutors.org` only. Gmail, Drive, Calendar, Sheets, Docs, Meet. Forms reads succeed through the Drive scope. |

## Do not

- Paste secrets in chat, commits, `.env`, `--reveal`, or `credential get` output
- `npm run secrets -- store --dest all`
- Store a `ctci-vault` token on Christina’s machine
- Dual-refresh the same Google account from disk + vault
- Read Keychain `google-oauth.workspace-client` except when creating a new vault's Google credential, or when refreshing the laptop Workspace admin token in memory
- Write the Google OAuth client JSON back to disk
- Put the Workspace admin token (`google-oauth.workspace-admin`) in Agent Vault, on Silas, or back into the disk token file
- Put Stripe, Loops, or Mercury in `ct-christina-vault`
- Connect `CT_CHRISTINA_GOOGLE_OAUTH` as hello@ or as `christina@christinaelaine.com`
- Reuse a rejected/expired approve link
- Dump the whole vault with `credential list` / `service list`

Install / refresh: `bash install.sh --face {{FACE}}` from `cianwhalley/agent-global-skills`.
