#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"
DAEMON_DIR="$HOME/.tokendraft"

echo "Installing TokenDraft skills..."

mkdir -p "$SKILLS_DIR"
mkdir -p "$DAEMON_DIR"

for skill in tokendraft-auth tokendraft-draft tokendraft-tournaments tokendraft-rankings; do
  rm -rf "$SKILLS_DIR/$skill"
  cp -r "$SCRIPT_DIR/skills/$skill" "$SKILLS_DIR/$skill"
  echo "  Installed $skill"
done

cp "$SCRIPT_DIR/skills/tokendraft-draft/scripts/tokendraft-daemon.ts" "$DAEMON_DIR/tokendraft-daemon.ts"
echo "  Installed tokendraft-daemon.ts to $DAEMON_DIR"

echo ""
echo "TokenDraft skills installed. Start a new OpenClaw session to use them."
