#!/bin/bash
# Cloud sessions start from a fresh container: install Graphify (a Python
# tool, not a plugin) so /graphify is ready. Does nothing on your own computer.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
export PATH="$HOME/.local/bin:$PATH"
if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then uv tool install --quiet graphifyy
  else pip install --quiet --user graphifyy; fi
fi
# Writes the /graphify skill to ~/.claude/skills (not into this repo).
[ -f "$HOME/.claude/skills/graphify/SKILL.md" ] || graphify install >/dev/null
