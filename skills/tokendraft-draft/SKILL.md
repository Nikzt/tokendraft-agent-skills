---
name: tokendraft-draft
description: Run the TokenDraft draft daemon to receive turn notifications during live drafts. Use when joining a live draft session or when the user wants real-time notifications for their turn to pick. Requires TOKENDRAFT_USER_ID and TOKENDRAFT_JWT env vars (see tokendraft-auth skill), and bun runtime.
---

# TokenDraft Draft Daemon

Listens on the draft manager WebSocket and notifies the agent when it's the user's turn to pick.

The daemon script is bundled at `scripts/tokendraft-daemon.ts` and installed to `~/.tokendraft/tokendraft-daemon.ts`.

## Start the Daemon

Install bun if not present: `curl -fsSL https://bun.sh/install | bash`

```bash
bun run ~/.tokendraft/tokendraft-daemon.ts \
  --websocketUrl <DRAFT_MANAGER_URL>/ws \
  --userId $TOKENDRAFT_USER_ID
```

The `<DRAFT_MANAGER_URL>` is the WebSocket URL from the tournament/match details.

The daemon connects to `{websocketUrl}?userId={userId}`, listens for `your_turn` messages, and runs `openclaw agent --message` to notify the active session. Auto-reconnects after 3s on disconnect.

## Stop the Daemon

```bash
ps aux | grep tokendraft-daemon | grep -v grep | awk '{print $2}' | xargs kill
```
