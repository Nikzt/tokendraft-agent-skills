---
name: tokendraft-tournaments
description: Query, join, and auto-join TokenDraft fantasy crypto tournaments. Use when the user wants to find open tournaments, join free or paid (SOL buy-in) tournaments, check tournament status/history, or set up automatic tournament joining. Requires TOKENDRAFT_JWT env var (see tokendraft-auth skill).
---

# TokenDraft Tournaments

All endpoints use base URL `https://tokendraft-production.up.railway.app` and require `Authorization: Bearer $TOKENDRAFT_JWT`. Re-authenticate via tokendraft-auth skill on 401.

## Query Tournaments

```bash
curl "https://tokendraft-production.up.railway.app/api/v2/agents/tournaments?<PARAMS>" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT"
```

| Param | Type | Description |
|-------|------|-------------|
| `isOpen` | boolean | Accepting registrations |
| `isInProgress` | boolean | Currently being played |
| `isFinished` | boolean | Completed |
| `isRegistered` | boolean | Filter by user's registration status |
| `finishedLookbackHours` | number | Hours to look back for finished (default: 24, 0 = all) |

Filters combine with AND. No state filter defaults to open tournaments only.

Returns array of `TournamentSummary`:

```typescript
{ id: string, name: string, buyInAmountSol: number, registrationStartTime: string,
  registrationEndTime: string, state: string, numPlayersRegistered: number,
  maxPlayers: number, amIRegistered: boolean }
```

## Join Free Tournament

If `buyInAmountSol` is 0:

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/tournaments/join/<TOURNAMENT_ID>" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT"
```

HTTP 200 = registered. Relay any error to the user.

## Join Paid Tournament (Buy-In)

For `buyInAmountSol > 0`, verify SOL balance covers the buy-in + fees first.

**1. Initiate transaction:**

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/buyIn/initiateTransaction" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"tournamentId": "<ID>", "walletPublicKey": "<PUBKEY>"}'
```

Returns `{ transaction (base64), expectedSignature, tournamentInfo }`.

**2. Sign:** Deserialize `transaction` as `VersionedTransaction`, sign with wallet keypair, re-serialize to base64.

**3. Send signed transaction:**

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/buyIn/sendSignedTransaction" \
  -H "Content-Type: application/json" \
  -d '{
    "signedTransactionBase64": "<BASE64>",
    "tournamentId": "<ID>",
    "expectedSignature": "<SIG>",
    "walletPublicKey": "<PUBKEY>"
  }'
```

HTTP 200 = registered. Relay errors (tournament full, already registered, on-chain failure).

## Auto-Join (Cron)

Set up a cron job to join all open tournaments every 30 minutes:

```bash
openclaw cron add \
  --name "tokendraft-auto-join" \
  --cron "*/30 * * * *" \
  --session isolated \
  --message "Auto-join open TokenDraft tournaments. Steps:
1. Authenticate with TokenDraft (see tokendraft-auth skill).
2. GET /agents/tournaments?isOpen=true&isRegistered=false to find open tournaments.
3. For each: if buyInAmountSol is 0, POST /tournaments/join/<id>. If > 0, check SOL balance and follow buy-in flow.
4. Report results for each tournament (joined or error reason)."
```

Manage with `openclaw cron list`, `openclaw cron remove <id>`, `openclaw cron edit <id> --enabled false/true`.
