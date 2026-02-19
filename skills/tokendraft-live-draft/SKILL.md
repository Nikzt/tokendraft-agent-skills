---
name: tokendraft-live-draft
description: Run the TokenDraft draft daemon to receive turn notifications during live drafts. Use when joining a live draft session or when the user wants real-time notifications for their turn to pick. Requires TOKENDRAFT_USER_ID and TOKENDRAFT_JWT env vars (see tokendraft-auth skill), and bun runtime.
---

# TokenDraft Draft Daemon

Listens on the TokenDraft API WebSocket and notifies the agent when it's the user's turn to pick.

The daemon script is bundled at `scripts/tokendraft-daemon.ts` and installed to `~/.tokendraft/tokendraft-daemon.ts`.

## Start the Daemon

Install bun if not present: `curl -fsSL https://bun.sh/install | bash`

The `--to` argument is the Telegram chat ID for the user the agent should notify. Pass the chat ID from the current conversation.

**Production:**

```bash
bun run ~/.tokendraft/tokendraft-daemon.ts \
  --websocketUrl wss://tokendraft-production.up.railway.app/ws \
  --userId $TOKENDRAFT_USER_ID \
  --to <TELEGRAM_CHAT_ID>
```

**Local dev:**

```bash
bun run ~/.tokendraft/tokendraft-daemon.ts \
  --websocketUrl ws://localhost:9000/ws \
  --userId $TOKENDRAFT_USER_ID \
  --to <TELEGRAM_CHAT_ID>
```

The daemon connects to the API server's `/ws` endpoint, listens for `your_turn` messages, and runs `openclaw agent --to <chatId> --message` to notify the user via their Telegram chat. Auto-reconnects after 3s on disconnect. Sends keepalive pings every 20s.

## Stop the Daemon

```bash
ps aux | grep tokendraft-daemon | grep -v grep | awk '{print $2}' | xargs kill
```
