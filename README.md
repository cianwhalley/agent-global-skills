# agent-global-skills

Shared Cursor skills for **Agent Vault**: the CT/Cleo overlay (`secrets`), the official `agent-vault-cli` skill, (Silas/Cian faces) tutor **Linear**, and the graphify agents skill.

Not product secrets. The overlay tells agents which vault, where the **agent token** lives (Keychain vs disk), and which broker URL — then they `source vault-env.sh` and `vault_run`.

## Install

```bash
git clone https://github.com/cianwhalley/agent-global-skills.git
cd agent-global-skills
bash install.sh --face silas          # Christina laptop + Silas VPS (secrets + Linear + graphify)
bash install.sh --face cleo           # Cleo VPS (secrets + graphify)
bash install.sh --face cian           # Cian laptop (vault picker + Linear + graphify)
bash install.sh --face cian --also-claude
```

Christina: `--face silas`. That installs Linear into `~/.cursor/skills/linear` (CON / tutor only). Cog / CopperTeams / Ganttsy stay on Cleo.

Session-start (hubs / connected-tutoring): if `~/.cursor/skills/secrets` is missing or the stamp SHA drifted:

```bash
bash ensure-install.sh --face silas
```

`ensure-install.sh` clones/pulls `~/.cache/agent-global-skills` and no-ops when the stamp matches.

## Faces

| `--face` | Vault | Token | ADDR | Linear |
|----------|-------|-------|------|--------|
| `silas` | `silas-spike` | Keychain on Mac, else `~/.config/agent-vault/agent-silas-spike.token` | laptop `http://cleo:14321`, VPS `http://127.0.0.1:14321` | CON / tutor |
| `cleo` | `cleo-spike` | `~/.config/agent-vault/agent-cleo-spike.token` | VPS localhost | skip (Cleo hub) |
| `cian` | picker | Keychain `agent-vault.<vault>` / `token` | `http://cleo:14321` | CON / tutor |

Cleo must **not** run Silas `install-global-skills.sh`. Cian must **not** install `--face silas` over the picker.

## Layout

```
install.sh
ensure-install.sh
refresh-graphify-skill.sh        # copy skill from the installed graphifyy package
skills/secrets/SKILL.md          # overlay ({{FACE}} / {{VAULT}} filled at install)
skills/agent-vault-cli/SKILL.md  # official GET /v1/skills/cli (refreshed at install)
skills/linear/                   # tutor CLI; silas + cian faces only
skills/graphify/                 # agents skill + references (.graphify_version)
```

Linear after install:

```bash
bash ~/.cursor/skills/linear/scripts/with-vault.sh tutor my
```

## graphify

Product repos should not vendor this skill. `install.sh` copies `skills/graphify` to `~/.cursor/skills/graphify`, `~/.agents/skills/graphify`, and `~/.claude/skills/graphify`.

After `uv tool upgrade graphifyy`:

```bash
bash refresh-graphify-skill.sh
bash install.sh --face cian
```
