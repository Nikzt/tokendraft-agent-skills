---
name: tokendraft-rankings
description: Manage auto-draft asset priority rankings for TokenDraft tournaments. Use when the user wants to set, update, or automate their token draft order preferences based on market data or custom strategies. Requires TOKENDRAFT_JWT env var (see tokendraft-auth skill).
---

# TokenDraft Asset Rankings

All endpoints use base URL `https://tokendraft-production.up.railway.app` and require `Authorization: Bearer $TOKENDRAFT_JWT`. Re-authenticate via tokendraft-auth skill on 401.

## Step 1: Ask the User for Ranking Advice

Ask how they want assets ranked before fetching data (e.g. by market cap, volume, buy the dip, memecoins first).

## Step 2: Fetch Assets

```bash
curl "https://tokendraft-production.up.railway.app/api/v2/assets" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT"
```

Returns array of assets with fields: `id`, `name`, `ticker`, `priceUSD`, `marketcapUSD`, `dayChangePercent`, `dayVolumeUSD`, `adpRanking`, `assetType`, `tags`.

## Step 3: Rank

Assign each asset a rank from 1 (drafted first) to N (last). Use the user's advice combined with financial data.

Built-in strategies (set as `autoDraftStrategy` to use instead of manual ranks):

`VOL_24H_DESC`, `VOL_24H_ASC`, `MKT_CAP_ASC`, `MKT_CAP_DESC`, `ADP`, `PERCENT_24H_ASC`, `PERCENT_24H_DESC`

## Step 4: Submit Rankings

```bash
curl -X PUT "https://tokendraft-production.up.railway.app/api/v2/assetPriorityRankings" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "assets": [{"assetId": "<ID>", "rank": 1}, ...],
    "autoDraftStrategy": null
  }'
```

Include every asset. Set `rank` to unique integers. Set `autoDraftStrategy` to a built-in strategy or `null` for custom.

## Auto-Update Rankings (Cron)

Ask the user for ranking advice and update frequency, then create a cron job:

```bash
openclaw cron add \
  --name "tokendraft-auto-rank" \
  --cron "<CRON_EXPRESSION>" \
  --session isolated \
  --message "Update TokenDraft rankings. Steps:
1. Authenticate (see tokendraft-auth skill).
2. GET /api/v2/assets for current data.
3. Rank all assets 1-N based on: <USER_RANKING_ADVICE>.
4. PUT /api/v2/assetPriorityRankings with ranked list.
5. Report success or failure."
```

Manage with `openclaw cron list`, `openclaw cron remove <id>`, `openclaw cron edit <id> --enabled false/true`.
