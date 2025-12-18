# NGO Wallet - Multisig Safe Wallet Management

A comprehensive multisig wallet management system for NGOs built with Para SDK, Safe Protocol Kit, and Next.js.

## Features

- ✅ **Create Multisig Safe Wallets** - Deploy Safe wallets with multiple signers
- ✅ **Signer Management** - Add, remove, and replace signers; update approval thresholds
- ✅ **Multisig Transactions** - Create, sign, and execute transactions with multiple approvals
- ✅ **Custom Threshold Per Transaction** - Set custom signature requirements for each transaction
- ✅ **Pending Transactions** - View and manage transactions awaiting signatures
- ✅ **Sepolia Testnet** - Fully configured for Sepolia testnet

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Wallet**: Para SDK v2 (EVM)
- **Smart Contracts**: Safe Protocol Kit v6.0.1
- **Safe API**: Custom direct API integration (v1)
- **Network**: Sepolia Testnet
- **Styling**: Tailwind CSS

## Prerequisites

1. **Node.js** v18+ and npm
2. **Para API Key** - Get from [Para Dashboard](https://dashboard.getpara.com)
3. **Safe API Key** - Get from [Safe Developer Portal](https://developer.safe.global)
4. **Sepolia ETH** - For deployment and transactions

## Installation

### 1. Clone and Install

```bash
cd /path/to/para
npm install
```

### 2. Environment Variables

Create `.env.local`:

```env
# Para SDK
NEXT_PUBLIC_PARA_API_KEY=your_para_api_key_here

# Safe API
NEXT_PUBLIC_SAFE_API_KEY=your_safe_api_key_here

# App Config
NEXT_PUBLIC_APP_NAME=NGO Wallet Management
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Production

```bash
npm run build
npm start
```

## Usage Guide

### 1. Create a Multisig Wallet

1. Connect your Para wallet
2. Go to "Create Wallet" tab
3. Add signer addresses (Ethereum addresses)
4. Set approval threshold (e.g., 2 of 3)
5. Click "Create NGO Wallet"
6. Approve the deployment transaction

**Result:** A new Safe wallet address deployed on Sepolia

### 2. Manage Signers

**Add Signer:**
1. Go to "Manage Signers" tab
2. Enter new signer address
3. Update threshold if needed
4. Click "Add Signer"

**Remove Signer:**
1. Select signer to remove
2. Set new threshold (≤ remaining signers)
3. Click "Remove Signer"

**Update Threshold:**
1. Enter new threshold (1 to total signers)
2. Click "Update Threshold"

**Note:** 
- For threshold = 1: Transaction executes immediately
- For threshold > 1: Transaction is proposed to Safe Transaction Service for other signers to approve

### 3. Send Transactions

1. Go to "Send Payment" tab
2. Enter token address (e.g., USDC on Sepolia)
3. Enter recipient address
4. Enter amount
5. Click "Send Payment"

**If threshold = 1:**
- Transaction executes immediately

**If threshold > 1:**
- Transaction is proposed to Safe Transaction Service
- Other signers can sign in "Pending Transactions" tab

### 4. Sign and Execute Pending Transactions

1. Switch wallet to a signer address
2. Go to "Pending Transactions" tab
3. View pending transactions
4. Click "Sign Transaction" to add your signature
5. When threshold is met, click "Execute Transaction"

## Project Structure

```
para/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx           # Main application page
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── ngo-wallet-creator.tsx      # Create multisig Safe
│   │   ├── signer-manager.tsx          # Manage signers
│   │   ├── ngo-transaction.tsx         # Send transactions
│   │   ├── pending-transactions.tsx    # View/sign pending txs
│   │   ├── ngo-wallet-manager.tsx      # Main manager component
│   │   └── providers.tsx               # Para SDK provider
│   ├── hooks/                 # React hooks
│   │   ├── useSafeProtocolKit.ts       # Safe SDK integration
│   │   └── useCreateSafeMultisig.ts    # Deploy Safe wallets
│   ├── lib/                   # Utilities
│   │   ├── safeHelpers.ts             # Safe SDK helpers
│   │   └── safeTxService.ts           # Safe API client
│   └── config/
│       └── network.ts         # Network configuration
├── .env.local                 # Environment variables
└── package.json
```

## Key Files

### Network Configuration

`src/config/network.ts` - Centralized network settings:

```typescript
export const CHAIN = sepolia;
export const RPC_URL = "https://sepolia.infura.io/v3/...";
export const SAFE_TX_SERVICE_URL = "https://api.safe.global/tx-service/sep/api/v1";
export const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY || "";
```

### Safe Transaction Service Client

`src/lib/safeTxService.ts` - Direct API calls to Safe Transaction Service:

- `proposeTransaction()` - Propose new multisig transaction
- `getPendingTransactions()` - Fetch pending transactions
- `confirmTransaction()` - Add signature to transaction
- `getTransaction()` - Get transaction details

**Why custom client?** SafeApiKit v4.0.1 tries to use `/v2/` endpoints which don't exist on Sepolia. We use direct fetch calls to `/api/v1/` endpoints.

### Safe Helpers

`src/lib/safeHelpers.ts` - Safe Protocol Kit utilities:

- `getSafeSdk()` - Initialize Safe SDK with Para provider
- `createParaEip1193Provider()` - Bridge Para wallet to EIP-1193
- `addSigner()`, `removeSigner()`, `updateThreshold()` - Signer management

## Multisig Flow

### Threshold = 1 (Single Signer)

```
Create Transaction → Sign → Execute Immediately
```

### Threshold > 1 (Multisig)

```
Owner A: Create Transaction → Sign → Propose to Safe TX Service
                                         ↓
Owner B: View Pending → Sign Transaction
                                         ↓
Owner C: View Pending → Sign Transaction
                                         ↓
Any Owner: Execute Transaction (when threshold met)
```

## API Integration

### Para SDK Integration

- `useAccount()` - Get connected account status
- `useWallet()` - Access wallet client for signing
- `useViemAccount()` - Get viem account for address
- `useViemClient()` - Get viem client for blockchain calls

### Safe Protocol Kit Integration

- Create Safe wallets with `Safe.init()`
- Manage owners with `createAddOwnerTx()`, `createRemoveOwnerTx()`
- Update threshold with `createChangeThresholdTx()`
- Create transactions with `createTransaction()`
- Sign with `signTransaction()`
- Execute with `executeTransaction()`

### Safe Transaction Service Integration

Custom direct API calls to handle multisig flow:

- Propose transactions for multiple signatures
- Fetch pending transactions across all signers
- Confirm transactions with additional signatures
- Execute when threshold is met

## Important Notes

### Address Checksumming

All addresses sent to Safe Transaction Service **must be EIP-55 checksummed**:

```typescript
import { getAddress } from 'viem';
const checksummed = getAddress(address);
```

### API Key Requirements

Safe Transaction Service requires an API key for `api.safe.global` domains. Set in environment variables:

```env
NEXT_PUBLIC_SAFE_API_KEY=your_key_here
```

### Empty Response Handling

Safe API returns `201 Created` with empty body on success. Handle safely:

```typescript
const text = await response.text();
if (!text || text.trim() === '') {
  return; // Success
}
return JSON.parse(text);
```

## Network Information

- **Chain**: Sepolia Testnet
- **Chain ID**: 11155111
- **RPC URL**: Infura/Alchemy Sepolia endpoint
- **Safe TX Service**: `https://api.safe.global/tx-service/sep/api/v1`
- **Block Explorer**: `https://sepolia.etherscan.io`

## Testing

### Test Flow 1: Create and Manage Safe

1. Create Safe with 3 signers, threshold 2
2. Add a 4th signer
3. Update threshold to 3
4. Remove a signer
5. Verify on [Sepolia Etherscan](https://sepolia.etherscan.io)

### Test Flow 2: Multisig Transaction

1. Create transaction (Owner A signs automatically)
2. Switch to Owner B wallet
3. Sign the pending transaction
4. Execute when threshold met
5. Verify transaction on Etherscan

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details and architecture decisions.

## License

MIT

## Support

For issues and questions:
- Para SDK: [Para Documentation](https://docs.getpara.com)
- Safe Protocol: [Safe Documentation](https://docs.safe.global)
