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
  maxPlayers: number, amIRegistered: boolean,
  draftType: "snake" | "boosterPack" | "instantRoster",
  rosterSlots: { Chain?: number, Meme?: number, Utility?: number, NFT?: number, Flex?: number } }
```

## Join Free Tournament

If `buyInAmountSol` is 0:

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/tournaments/join/<TOURNAMENT_ID>" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT"
```

HTTP 200 = registered. Relay any error to the user.

Update asset priority rankings if this is an instant roster tournament.

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

Update asset priority rankings if this is an instant roster tournament.

## Instant Roster Tournaments

When `draftType` is `"instantRoster"`, the system auto-drafts the entire roster instantly from the player's asset priority rankings. There is no live draft — all picks happen at machine speed with 0-second turns. Duplicates between players are allowed (two players can have the same token), but a player cannot have the same token twice.

**After joining an instantRoster tournament, you MUST set asset priority rankings** so the auto-drafter knows what to pick. Use the tokendraft-rankings skill endpoints.

### How to build rankings that fulfil roster slots

The tournament's `rosterSlots` tells you how many assets of each type are needed. Each asset from `GET /api/v2/assets` has an `assetType` field (e.g. `"Chain"`, `"Meme"`, `"Utility"`, `"NFT"`). The `"Flex"` slot accepts any type.

**Steps:**

1. Fetch assets: `GET /api/v2/assets` — returns `[{ id, name, ticker, assetType, priceUSD, marketcapUSD, dayChangePercent, dayVolumeUSD, ... }]`
2. Read `rosterSlots` from the tournament (e.g. `{ "Chain": 2, "Meme": 2, "Utility": 1, "NFT": 1, "Flex": 1 }`)
3. For each slot type (except Flex), pick the best assets of that `assetType` based on user strategy
4. For the Flex slot(s), pick the best remaining asset of any type
5. Submit as ranked list via `PUT /api/v2/assetPriorityRankings`

**Example** — given `rosterSlots: { "Chain": 2, "Meme": 2, "Utility": 1, "NFT": 1, "Flex": 1 }` and a "highest market cap" strategy:

```
assets = GET /api/v2/assets
Sort assets by marketcapUSD descending within each assetType:
  chains  = assets.filter(a => a.assetType === "Chain").sort(by marketcapUSD desc)
  memes   = assets.filter(a => a.assetType === "Meme").sort(by marketcapUSD desc)
  utils   = assets.filter(a => a.assetType === "Utility").sort(by marketcapUSD desc)
  nfts    = assets.filter(a => a.assetType === "NFT").sort(by marketcapUSD desc)

Pick top N for each slot:
  rank 1: chains[0]    (Chain slot 1)
  rank 2: chains[1]    (Chain slot 2)
  rank 3: memes[0]     (Meme slot 1)
  rank 4: memes[1]     (Meme slot 2)
  rank 5: utils[0]     (Utility slot)
  rank 6: nfts[0]      (NFT slot)
  rank 7: best remaining asset of any type (Flex slot)

Anything set to rank 1 will be selected as "captain", and be worth double points, so set rank 1 as best overall pick within roster.

PUT /api/v2/assetPriorityRankings with:
  { "assets": [{"assetId":"<chains[0].id>","rank":1}, ...], "autoDraftStrategy": "MKT_CAP_DESC" }
```

### Full flow for instantRoster tournaments

1. Query open tournaments and find one with `draftType === "instantRoster"`
2. Join the tournament (free or paid flow as above)
3. Fetch assets from `GET /api/v2/assets`
4. Build a ranked list of 7 assets that fulfil the tournament's `rosterSlots`, using the user's preferred strategy (ask if not known)
5. Submit rankings via `PUT /api/v2/assetPriorityRankings` (see tokendraft-rankings skill)
6. **Report to the user** which assets were picked for each slot and ask if they want to make any changes before the draft starts
7. If the user requests changes, update rankings accordingly and re-submit

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
4. If the joined tournament has draftType 'instantRoster', also set asset priority rankings (see tokendraft-rankings skill) that fulfil the rosterSlots.
5. Report results for each tournament (joined or error reason)."
```

Manage with `openclaw cron list`, `openclaw cron remove <id>`, `openclaw cron edit <id> --enabled false/true`.
