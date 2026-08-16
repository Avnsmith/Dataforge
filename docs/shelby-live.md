# Live Shelby Network Integration Guide

This guide details how to configure, fund, run, and verify the official live Shelby network integration within DataForge AI.

---

## 1. Environment Configuration

To enable real decentralized storage on the Shelby network, configure the following variables in your `.env` file:

```ini
# Storage Mode (mock or live)
SHELBY_MODE=live

# The target network (e.g. testnet, local, or shelbynet)
SHELBY_NETWORK=shelbynet

# Your Aptos wallet account address
SHELBY_ACCOUNT=0x147e4d3a5b10eaed2a93536e284c23096dfcea9ac61f0a8420e5d01fbd8f0ea8

# Private key for uploader account (MUST start with 0x followed by hex)
SHELBY_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111

# The endpoint of your Shelby RPC node
SHELBY_RPC_URL=https://api.shelbynet.shelby.xyz/v1

# Optional Shelby API Key (if RPC node requires API key auth)
SHELBY_API_KEY=your-api-key-here

# Explorer URL format
SHELBY_EXPLORER_BASE_URL=https://explorer.shelby.xyz/shelbynet
```

---

## 2. Mock vs Live Mode

| Feature | Mock Mode (`SHELBY_MODE=mock`) | Live Mode (`SHELBY_MODE=live`) |
|---|---|---|
| **Storage Destination** | Local disk (`packages/shelby/storage/`) | Decentralized Shelby Storage Nodes |
| **Commitment Ledger** | Deterministic local simulation | Aptos L1 Blockchain Ledger |
| **Credentials Required**| None (defaults are used) | Valid `SHELBY_PRIVATE_KEY` and gas funds |
| **Upload Speed** | Instant | Dependent on blockchain block time and RPC |
| **File Verification** | Local hash matching | Full on-chain commitment + download audit |

---

## 3. Account Setup and Funding

Decentralized uploads require two assets:
1. **APT Tokens:** To pay for Aptos gas fees on-chain.
2. **shelbyUSD Tokens:** To pay for storage rental slots.

If running on **shelbynet**, you can request faucet funding using the SDK's built-in faucet endpoints. We can execute the following snippet in a local Node.js process to bootstrap the account with test tokens:

```typescript
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import { Network } from '@aptos-labs/ts-sdk';

const client = new ShelbyNodeClient({
  network: Network.CUSTOM,
  rpc: {
    baseUrl: 'https://api.shelbynet.shelby.xyz/v1',
  },
});

const address = '0x147e4d3a5b10eaed2a93536e284c23096dfcea9ac61f0a8420e5d01fbd8f0ea8';

// 1. Request testnet APT tokens
console.log('Funding account with APT...');
await client.fundAccountWithAPT({
  address,
  amount: 100_000_000, // 1 APT
});

// 2. Request testnet shelbyUSD tokens
console.log('Funding account with shelbyUSD...');
await client.fundAccountWithShelbyUSD({
  address,
  amount: 100_000_000, // 100 shelbyUSD
});
```

---

## 4. How to Test Live Operations

A test integration script is provided in `packages/shelby/src/client.spec.ts` under the description block `"LiveShelbyProvider Integration Tests (Credential Checked)"`.

### Run tests in Mock Mode (Default)
```bash
# Live tests will be skipped automatically since live credentials are empty
npm test --workspace=packages/shelby
```

### Run tests in Live Mode
To run tests against the real network:
1. Populate your `.env` with real testnet credentials.
2. Load environment variables and execute Jest:
   ```bash
   export $(grep -v '^#' .env | xargs) && npm test --workspace=packages/shelby
   ```

If the credentials are valid, the test suite will perform:
- Merkle root/commitment generation.
- Real file upload to Shelby network nodes.
- Coordination registry on the testnet ledger.
- Retrieve the uploaded blob back and assert byte-level integrity.

---

## 5. Known Limitations

- **Memory buffering:** The current client loads the file buffer into memory during upload. Streaming upload support for extremely large files (>2 GiB) is planned for a future update.
- **RPC Availability:** If the Shelby RPC node goes offline or is throttled, file uploads and downloads will throw network errors.
