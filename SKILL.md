---
name: tokendraft
description: Full suite for TokenDraft fantasy crypto tournaments — authenticate with a Solana wallet, query/join/auto-join tournaments, and manage auto-draft asset priority rankings.
env:
  - name: SOLANA_PRIVATE_KEY
    description: Base58-encoded Solana Ed25519 private key used to derive the wallet public key, sign authentication challenges, and sign on-chain buy-in transactions.
    required: true
    sensitive: true
---

# TokenDraft Authentication

Two-step challenge-response flow. Private key never leaves the local environment.

After successful login, store `TOKENDRAFT_USER_ID` (from `user.id`) and `TOKENDRAFT_JWT` (from `token`) as env vars. These are required by all other TokenDraft endpoints.

**If any TokenDraft endpoint returns 401, re-run this auth flow automatically and retry the failed request.**

## Step 1: Request a Nonce

```bash
curl -X POST https://tokendraft-production.up.railway.app/api/v2/agents/nonce \
  -H "Content-Type: application/json" \
  -d '{"walletPublicKey": "<WALLET_PUBLIC_KEY>"}'
```

Returns `{ nonce, message }`. The `message` is the exact string to sign. Nonce expires after 5 minutes, single-use.

## Step 2: Sign and Log In

Sign `message` locally with Ed25519, base58-encode the signature:

```bash
curl -X POST https://tokendraft-production.up.railway.app/api/v2/agents/login \
  -H "Content-Type: application/json" \
  -d '{
    "walletPublicKey": "<WALLET_PUBLIC_KEY>",
    "nonce": "<NONCE>",
    "signature": "<BASE58_SIGNATURE>"
  }'
```

Returns `{ token, user }`. First login auto-creates an account.

**On first login** (the user's `displayName` is a short hash like `"a3F9x"`), immediately ask the user: "Would you like to set a display name for your TokenDraft account?" If yes, ask them for the name they want and call the Set Display Name endpoint below. If no, continue without changing it.

## Set Display Name

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/users/displayName" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "<NEW_NAME>"}'
```

**Success response** (HTTP 200):

```json
{ "data": { "displayName": "chosen_name", "id": "<USER_ID>", "updatedDisplayNameAt": "<ISO_DATE>" }, "status": "success" }
```

**Error responses:**

- HTTP 400 `{"error": "Display name is already taken"}` — the name is not unique, ask the user to pick a different one.
- HTTP 429 `{"error": "Cannot change name more than once within 24 hours. Please try again in X hours and Y minutes.", "retryAfterMs": <MS>}` — rate-limited, inform the user when they can try again.
- HTTP 404 `{"error": "User not found"}` — re-authenticate and retry.

Constraints: display name must be unique across all users. Can only be changed once every 24 hours.

## Signing Reference

```javascript
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const secretKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY);
const keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
const walletPublicKey = bs58.encode(keyPair.publicKey);

// Step 1
const { nonce, message } = await fetch('https://tokendraft-production.up.railway.app/api/v2/agents/nonce', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletPublicKey }),
}).then(r => r.json());

// Step 2
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
const signatureBase58 = bs58.encode(signature);

const { token, user } = await fetch('https://tokendraft-production.up.railway.app/api/v2/agents/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletPublicKey, nonce, signature: signatureBase58 }),
}).then(r => r.json());
```

## Token Usage

Include in all authenticated requests:

```
Authorization: Bearer $TOKENDRAFT_JWT
```

Token does not expire but may be invalidated on server secret rotation.

---

# TokenDraft Tournaments

All endpoints use base URL `https://tokendraft-production.up.railway.app` and require `Authorization: Bearer $TOKENDRAFT_JWT`. Re-authenticate via the auth flow above on 401.

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

HTTP 200 = registered. Relay any error to the user. Share the lobby link: `https://tokendraft.fun/tournaments/<TOURNAMENT_ID>`

After joining, submit a team for this tournament (see Submit Team section below).

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

HTTP 200 = registered. Relay errors (tournament full, already registered, on-chain failure). Share the lobby link: `https://tokendraft.fun/tournaments/<TOURNAMENT_ID>`

After joining, submit a team for this tournament (see Submit Team section below).

## Auto-Join (Cron)

Set up a cron job to join all open tournaments every 30 minutes:

```bash
openclaw cron add \
  --name "tokendraft-auto-join" \
  --cron "*/30 * * * *" \
  --session isolated \
  --message "Auto-join open TokenDraft tournaments. Steps:
1. Authenticate with TokenDraft (see auth section above).
2. GET /agents/tournaments?isOpen=true&isRegistered=false to find open tournaments.
3. For each: if buyInAmountSol is 0, POST /tournaments/join/<id>. If > 0, check SOL balance and follow buy-in flow.
4. After joining each tournament, submit a team (see Submit Team section).
5. Report results for each tournament (joined or error reason)."
```

Manage with `openclaw cron list`, `openclaw cron remove <id>`, `openclaw cron edit <id> --enabled false/true`.

---

# Submit Team for Tournament

After joining any tournament, you must submit a team. All endpoints use base URL `https://tokendraft-production.up.railway.app` and require `Authorization: Bearer $TOKENDRAFT_JWT`.

## Step 1: Get Roster Slots

Read the `rosterSlots` from the tournament (returned by the Query Tournaments endpoint). This tells you how many assets of each type are needed.

Example: `{ "Chain": 2, "Meme": 2, "Utility": 1, "NFT": 1, "Flex": 1 }`

If a slot type is not present or has a value <= 0, ignore assets of that type.

## Step 2: Fetch Available Assets

```bash
curl "https://tokendraft-production.up.railway.app/api/v2/assets" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT"
```

Returns array of assets with fields: `id`, `name`, `ticker`, `priceUSD`, `marketcapUSD`, `dayChangePercent`, `dayVolumeUSD`, `adpRanking`, `assetType`, `tags`.

Each asset has an `assetType` (e.g. `"Chain"`, `"Meme"`, `"Utility"`, `"NFT"`). The `"Flex"` slot accepts any type.

## Step 3: Ask for Strategy

If the user hasn't already given ranking advice, ask how they want their team built (e.g. by market cap, volume, buy the dip, memecoins first).

## Step 4: Build Team

For each slot type (except Flex), pick the best assets of that `assetType` based on the user's strategy. For Flex slot(s), pick the best remaining asset of any type.

**Example** — given `rosterSlots: { "Chain": 2, "Meme": 2, "Utility": 1, "NFT": 1, "Flex": 1 }` and a "highest market cap" strategy:

```
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
```

Order the team in descending order of which asset you think will perform best. The asset at rank 1 is the **captain** and earns double points — so put the strongest overall pick first.

## Step 5: Submit Team

```bash
curl -X PUT "https://tokendraft-production.up.railway.app/api/v2/assetPriorityRankings" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "assets": [{"assetId": "<ID>", "rank": 1}, {"assetId": "<ID>", "rank": 2}, ...]
  }'
```

Include exactly as many assets as the total number of roster slots for the tournament. Set `rank` to unique integers starting at 1.

## Step 6: Confirm with User

Report which assets were picked for each slot and ask if they want to make any changes before the draft starts. If the user requests changes, rebuild and re-submit.
