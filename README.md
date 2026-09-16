# agent-global-skills

Shared Cursor skills for **Agent Vault**: the CT/Cleo overlay (`secrets`) plus the official `agent-vault-cli` skill.

Not product secrets. The overlay tells agents which vault, where the **agent token** lives (Keychain vs disk), and which broker URL — then they `source vault-env.sh` and `vault_run`.

## Install

```bash
git clone https://github.com/cianwhalley/agent-global-skills.git
cd agent-global-skills
bash install.sh --face silas          # Christina laptop + Silas VPS
bash install.sh --face cleo           # Cleo VPS
bash install.sh --face cian           # Cian laptop (vault picker)
bash install.sh --face cian --also-claude
```

Session-start (hubs / connected-tutoring): if `~/.cursor/skills/secrets` is missing or the stamp SHA drifted:

```bash
bash ensure-install.sh --face silas
```

`ensure-install.sh` clones/pulls `~/.cache/agent-global-skills` and no-ops when the stamp matches.

## Faces

| `--face` | Vault | Token | ADDR |
|----------|-------|-------|------|
| `silas` | `silas-spike` | Keychain on Mac, else `~/.config/agent-vault/agent-silas-spike.token` | laptop `http://cleo:14321`, VPS `http://127.0.0.1:14321` |
| `cleo` | `cleo-spike` | `~/.config/agent-vault/agent-cleo-spike.token` | VPS localhost |
| `cian` | picker | Keychain `agent-vault.<vault>` / `token` | `http://cleo:14321` |

Cleo must **not** run Silas `install-global-skills.sh`. Cian must **not** install `--face silas` over the picker.

## Layout

```
install.sh
ensure-install.sh
skills/secrets/SKILL.md          # overlay ({{FACE}} / {{VAULT}} filled at install)
skills/agent-vault-cli/SKILL.md  # official GET /v1/skills/cli (refreshed at install)
```
