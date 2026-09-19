---
name: linear
description: >-
  Query and manage Linear for Connected Tutors (CON / tutor) only.
  Use for CON tickets, my issues, create/update, comments, and search.
  Cog / CopperTeams / Ganttsy live on Cleo — not this skill.
---

# Linear (Connected Tutors)

Tutor / **CON** only. Credential: `LINEAR_API_KEY_TUTORING` in vault **silas-spike**.

Do **not** use Cian’s Keychain `linear-management` skill. Do **not** query Cog, CopperTeams, or Ganttsy here — those are Cleo.

CLI is vendored from `silas-agent/skills/linear` (router + `linear.ts`). Linear on `api.linear.app` is **passthrough** — MITM cannot pick among orgs, so wrap the router in `vault_run` (or use `with-vault.sh`).

## Run

Prefer the vault wrapper (finds `vault-env.sh`, forces laptop ADDR to `http://cleo:14321`):

```bash
bash ~/.cursor/skills/linear/scripts/with-vault.sh tutor my
bash ~/.cursor/skills/linear/scripts/with-vault.sh tutor list
bash ~/.cursor/skills/linear/scripts/with-vault.sh tutor get CON-42
```

Already in **connected-tutoring** (or silas-agent) with vault sourced:

```bash
source scripts/vault-env.sh
# Laptop: if ADDR is localhost, export AGENT_VAULT_ADDR=http://cleo:14321
vault_run -- bash ~/.cursor/skills/linear/scripts/linear-router.sh tutor my
```

First time on a machine: `with-vault.sh tutor init` (refresh with `init --force` after team/label changes).

| Alias | Team | Default project | Env |
|-------|------|-----------------|-----|
| `tutor` (tutoring, connected-tutors, connected-tutoring, `con`) | CON | Administration | `LINEAR_API_KEY_TUTORING` |

Cache: `~/.cache/silas-agent/linear`. `repo` prints the connected-tutoring checkout when it can find one.

## Commands

```bash
R="bash ~/.cursor/skills/linear/scripts/with-vault.sh tutor"

$R init
$R my                          # your In Progress
$R list
$R list --status "In Progress"
$R list --json
$R find "welcome email"
$R get CON-42
$R get CON-42 --json
$R stats
$R defaults
$R repo

$R create "Follow up with parent" -d "…"
$R create "Spike" --no-milestone
$R create-smart "Title" "Context…"          # dry-run
$R create-smart "Title" "Context…" --yes
$R update CON-42 -s progress -p high
$R comment CON-42 "Blocked on Drive access"

$R milestones list
```

Status shorts: `todo` `progress` `review` `done` `blocked` `backlog`.  
Priority shorts: `urgent` `high` `medium` `low`.

## Do not

- Pass `cog` / `ct` / `gan` to this router (it exits)
- `credential get` or print `LINEAR_API_KEY_TUTORING`
- Install `--face cleo` for this skill (Cleo has its own Linear stack)
