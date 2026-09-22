#!/usr/bin/env bash
# Replace skills/graphify with the agents skill shipped by the installed graphifyy.
#
#   uv tool upgrade graphifyy
#   bash refresh-graphify-skill.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${GRAPHIFY_PYTHON:-$HOME/.local/share/uv/tools/graphifyy/bin/python}"

if [[ ! -x "$PY" ]]; then
  echo "refresh-graphify-skill: graphifyy python not found at $PY" >&2
  echo "  uv tool install graphifyy" >&2
  exit 1
fi

PKG="$("$PY" -c "import graphify, os; print(os.path.dirname(graphify.__file__))")"
VER="$("$PY" -c "from importlib.metadata import version; print(version('graphifyy'))")"
DEST="$ROOT/skills/graphify"

rm -rf "$DEST"
mkdir -p "$DEST/references"
cp "$PKG/skill-agents.md" "$DEST/SKILL.md"
cp -R "$PKG/skills/agents/references/." "$DEST/references/"
printf '%s\n' "$VER" >"$DEST/.graphify_version"
echo "skills/graphify refreshed from graphifyy $VER"
