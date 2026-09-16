---
name: secrets
description: >-
  Store and consume secrets via Agent Vault proposals and vault_run. Use when
  asking the user for an API key, storing a credential, picking silas-spike vs
  cleo-spike, or diagnosing missing tokens. Never paste secrets in chat.
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
| silas (Christina laptop) | `silas-spike` | Keychain `agent-vault.silas-spike` / `token` | `http://cleo:14321` |
| silas (VPS) | `silas-spike` | `~/.config/agent-vault/agent-silas-spike.token` | `http://127.0.0.1:14321` |
| cleo (VPS) | `cleo-spike` | `~/.config/agent-vault/agent-cleo-spike.token` | `http://127.0.0.1:14321` |
| cian (laptop picker) | by product (below) | Keychain `agent-vault.<vault>` / `token` | `http://cleo:14321` |

- **This face is silas:** never use `cleo-spike`. Source connected-tutoring or silas-agent `vault-env.sh`. On a laptop, if the hub script defaulted ADDR to localhost, `export AGENT_VAULT_ADDR=http://cleo:14321`.
- **This face is cleo:** never use `silas-spike`. Source cleo-agent `vault-env.sh`.
- **This face is cian:** picker below. Always source the hub/repo you are in so leftover sibling env is unset.

Owner password / `credential get` is **not** for agents. Proxy agent tokens only.

## Which vault? (cian face, or if this install is a picker)

If the user did not name the **vault** and the **org/product**, do not guess.

- **High certainty:** proceed, and log one sentence naming vault + credential key + why.
- **Any uncertainty:** stop and ask. “A Neon key” is uncertain. “Connected Tutors Neon API key” is not.

| High-certainty signal | Vault | Credential naming |
|-----------------------|-------|-------------------|
| Connected Tutors, tutoring repo, hello@, TeachWorks, Quo, Odyssey, CT Stripe | `silas-spike` | `CONNECTED_TUTORS_*` or the CT table below |
| Coaching / Christina Elaine (`*_COACHING`) | `silas-spike` | say so out loud |
| Cian personal, Cognitive Tech, Ganttsy, CopperTeams, Cleo Google, Xero | `cleo-spike` | never a `CONNECTED_TUTORS_*` key |

Repo cwd is a hint, not a default. A generic name (`NEON_API_KEY`) is always wrong
when the vault is shared across products.

**Silas/Cleo faces skip the picker** — this install already pinned the vault.

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

## Known keys (silas-spike)

| Need | Key | Host / notes |
|------|------|----------------|
| CT Google hello@ | `CONNECTED_TUTORS_GOOGLE_OAUTH` | Gmail/Drive/Sheets/Calendar |
| CT Neon Console API | `CONNECTED_TUTORS_NEON_API_KEY` | `console.neon.tech` |
| TeachWorks | `TEACHWORKS_API_KEY` | `api.teachworks.com` |
| Quo | `QUO_API_KEY` | |
| Stripe CT | `STRIPE_SECRET_KEY` | not `STRIPE_SECRET_KEY_COACHING` |
| Linear tutoring | `LINEAR_API_KEY_TUTORING` | |
| Odyssey portals | `ODYSSEY_<ST>_USERNAME` / `_PASSWORD` | form login; not MITM |

## Do not

- Paste secrets in chat, commits, `.env`, `--reveal`, or `credential get` output
- `npm run secrets -- store --dest all`
- Store a `cleo-spike` token on Christina’s machine
- Dual-refresh the same Google account from disk + vault
- Reuse a rejected/expired approve link
- Dump the whole vault with `credential list` / `service list`

Install / refresh: `bash install.sh --face {{FACE}}` from `cianwhalley/agent-global-skills`.
