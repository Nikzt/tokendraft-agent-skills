---
name: tokendraft-auth
description: Authenticate with the TokenDraft API using a Solana wallet (Ed25519 challenge-response). Use when logging in, obtaining a JWT, or when any TokenDraft API returns 401. Requires SOLANA_PRIVATE_KEY env var.
---

# TokenDraft Authentication

Two-step challenge-response flow. Private key never leaves the local environment.

After successful login, store `TOKENDRAFT_USER_ID` (from `user.id`) and `TOKENDRAFT_JWT` (from `token`) as env vars. These are required by all other TokenDraft skills.

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

**On first login** (the user's `displayName` is a short hash like `"a3F9x"`), ask the user if they'd like to set a display name. If yes, call the Update Display Name endpoint below.

## Update Display Name

```bash
curl -X POST "https://tokendraft-production.up.railway.app/api/v2/users/displayName" \
  -H "Authorization: Bearer $TOKENDRAFT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "<NEW_NAME>"}'
```

Constraints: display name must be unique across all users. Can only be changed once every 24 hours. HTTP 429 is returned with `retryAfterMs` if rate-limited.

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
