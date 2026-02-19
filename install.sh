#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"
DAEMON_DIR="$HOME/.tokendraft"

echo "Installing TokenDraft skills..."

mkdir -p "$SKILLS_DIR"

for skill in tokendraft-auth tokendraft-tournaments tokendraft-rankings; do
  rm -rf "$SKILLS_DIR/$skill"
  cp -r "$SCRIPT_DIR/skills/$skill" "$SKILLS_DIR/$skill"
  echo "  Installed $skill"
done

if [[ "$1" == "--with-live-draft" ]]; then
  mkdir -p "$DAEMON_DIR"
  rm -rf "$SKILLS_DIR/tokendraft-live-draft"
  cp -r "$SCRIPT_DIR/skills/tokendraft-live-draft" "$SKILLS_DIR/tokendraft-live-draft"
  echo "  Installed tokendraft-live-draft"
  cp "$SCRIPT_DIR/skills/tokendraft-live-draft/scripts/tokendraft-daemon.ts" "$DAEMON_DIR/tokendraft-daemon.ts"
  echo "  Installed tokendraft-daemon.ts to $DAEMON_DIR"
fi

echo ""
echo "TokenDraft skills installed. Start a new OpenClaw session to use them."

if [[ "$1" != "--with-live-draft" ]]; then
  echo ""
  echo "Optional: Install experimental live draft support:"
  echo "  bash install.sh --with-live-draft"
fi
