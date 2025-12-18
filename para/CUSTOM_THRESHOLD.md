# Custom Threshold Per Transaction

## Feature Overview

This feature allows you to **set a custom threshold for individual transactions**, independent of the Safe wallet's default threshold.

### Example

**Safe Configuration:**
- 3 owners (A, B, C)
- Default threshold: 2 of 3

**With Custom Threshold:**
- Transaction 1 (100 USDC): Require only **1 signature**
- Transaction 2 (500 USDC): Require **2 signatures** (use default)
- Transaction 3 (1500 USDC): Require all **3 signatures**

---

## How It Works

### 1. Create Transaction with Custom Threshold

**UI:**

```
Send Payment
┌─────────────────────────────────────────┐
│ Token Address: 0x1c7D4B...              │
│ Recipient: 0xABC...                     │
│ Amount: 500 USDC                        │
│ Required Signatures: [Dropdown]         │  ← NEW!
│   ○ Use Safe default (2 of 3)           │
│   ○ 1 of 3 signatures                   │
│   ○ 2 of 3 signatures                   │
│   ○ 3 of 3 signatures                   │
│ [Send Payment]                           │
└─────────────────────────────────────────┘
```

**What Happens:**
1. User selects custom threshold (e.g., "3 of 3")
2. Transaction is created and signed by creator
3. Custom threshold is saved in transaction metadata (origin field)
4. Transaction is proposed to Safe Transaction Service

### 2. View Pending Transaction

**Pending Transactions Tab:**

```
Transaction                          1 / 3 signatures (Custom)
─────────────────────────────────────────────────────────────
Safe Tx Hash: 0xcb540...
Type: Token Transfer
Amount: 500 USDC
Recipient: 0x1c7D4B196Cb0C...
Token: 0x1c7D4B196Cb0C...
Custom Threshold: 3 signatures required (Safe default: 2) ← Shows custom
Created: 12/17/2025 10:41:26

[✍️ Sign Transaction]  [🚀 Execute Transaction]
```

**Indicators:**
- "(Custom)" badge next to signature count
- Orange warning showing custom vs. default threshold
- Token amount displayed correctly

### 3. Signing Flow

**Owner B and Owner C:**
1. Switch to their wallet
2. Go to "Pending Transactions"
3. See custom threshold: "3 signatures required"
4. Click "Sign Transaction"
5. Confirm in wallet

### 4. Execute Transaction

**When Threshold Met:**
- Custom threshold: 3 signatures collected ✅
- "Execute Transaction" button appears
- Anyone can execute (not limited to signers)
- Transaction executes on-chain

---

## Technical Implementation

### Storage Method

Custom threshold is stored in Safe Transaction Service's `origin` field as JSON metadata:

```typescript
const metadata = {
  app: "NGO Wallet Management",
  requiredSignatures: 3,      // Custom threshold
  amount: "500",
  token: "USDC"
};

proposeTransaction({
  ...txData,
  origin: JSON.stringify(metadata)
});
```

### Retrieval and Validation

```typescript
// In pending-transactions.tsx
let customThreshold = threshold; // Default

if (tx.origin) {
  try {
    const metadata = JSON.parse(tx.origin);
    if (metadata.requiredSignatures) {
      customThreshold = metadata.requiredSignatures;
    }
  } catch (e) {
    // Not JSON, use default
  }
}

// Check if can execute
const canExecute = confirmationsCount >= customThreshold;
```

### UI Updates

**Create Transaction (ngo-transaction.tsx):**
- Added `requiredSignatures` state
- Dropdown to select 1 to N signatures (N = total owners)
- Shows warning if differs from Safe default
- Stores in metadata when proposing

**Pending Transactions (pending-transactions.tsx):**
- Extracts custom threshold from `origin` field
- Displays "(Custom)" badge
- Shows custom vs. default comparison
- Validates signatures against custom threshold

---

## Use Cases

### 1. Low-Value Transactions

**Scenario:** Small payments don't need full approval

```
Amount: 50 USDC
Required: 1 of 3 signatures
Use Case: Petty cash, recurring payments
```

### 2. High-Value Transactions

**Scenario:** Large payments need unanimous approval

```
Amount: 10,000 USDC
Required: 3 of 3 signatures
Use Case: Major purchases, fund transfers
```

### 3. Medium Transactions

**Scenario:** Use Safe's default threshold

```
Amount: 500 USDC
Required: 2 of 3 signatures (default)
Use Case: Normal operations
```

### 4. Varying Risk Levels

**Scenario:** Different recipients have different trust levels

```
Known Partner:     1 of 3 (trusted)
New Vendor:        2 of 3 (normal)
Unverified Party:  3 of 3 (high risk)
```

---

## Benefits

### ✅ **Flexibility**
- Adapt threshold to each transaction
- No need to change Safe configuration
- Quick approvals for small amounts
- Extra security for large amounts

### ✅ **User Experience**
- Clear visual indicators (badge, warning)
- Easy dropdown selection
- See custom vs. default comparison
- Transparent approval requirements

### ✅ **Security**
- High-value transactions require more approvals
- Low-value transactions move faster
- Risk-based threshold selection
- Audit trail in metadata

### ✅ **Backward Compatible**
- Works with existing Safe smart contracts
- No changes to Safe Protocol Kit
- Uses existing Safe Transaction Service
- Falls back to default if not set

---

## Comparison: Custom vs. Policy-Based

| Aspect | Custom Threshold (This Feature) | Policy-Based Threshold |
|--------|--------------------------------|----------------------|
| **Control** | User selects per transaction | Automatic based on rules |
| **Flexibility** | Maximum (any tx can have any threshold) | Limited to predefined policies |
| **UX** | Manual dropdown selection | Automatic (no user input) |
| **Implementation** | Metadata storage | Logic in code |
| **Complexity** | Simple | Moderate |
| **Use Case** | Variable trust/risk scenarios | Consistent amount-based rules |

**This Implementation:** Custom threshold (user chooses)

**Alternative (Not Implemented):** Policy-based (automatic based on amount/recipient/etc.)

---

## Limitations & Considerations

### 1. **Safe Smart Contract Validation**

⚠️ **Important:** Safe smart contract still validates against its **default threshold** when executing.

**What This Means:**
- Safe default threshold: 2 of 3
- Custom threshold: 1 of 3
- You collect 1 signature ✅
- Try to execute → **FAILS** ❌ (Safe contract requires 2)

**Solution:**
- Custom threshold should be **≥ Safe's default**
- UI should warn if custom < default
- Or adjust Safe's threshold to 1 for maximum flexibility

### 2. **Off-Chain Validation**

Custom threshold is **off-chain** (stored in Safe TX Service metadata):
- Not enforced by blockchain
- Enforced by UI logic
- Users can ignore if using other interfaces

**Mitigation:**
- Clear UI indicators
- Documentation for users
- Consistent enforcement in all components

### 3. **Metadata Persistence**

Metadata is stored in Safe Transaction Service:
- Persists as long as transaction is pending
- Lost if transaction is deleted from service
- Not stored on-chain

**Best Practice:**
- Document custom threshold in transaction notes
- Keep records outside of Safe TX Service

---

## Future Enhancements

### 1. **Policy-Based Auto-Selection**

Automatically suggest threshold based on:
```typescript
if (amount < 100) return 1;
if (amount < 1000) return 2;
return totalOwners; // All signatures
```

User can still override.

### 2. **Recipient-Based Rules**

```typescript
const trustedRecipients = ["0xABC...", "0xDEF..."];
if (trustedRecipients.includes(recipient)) {
  return 1; // Low threshold for trusted
}
return 3; // High threshold for others
```

### 3. **Time-Based Thresholds**

```typescript
const isBusinessHours = 
  hour >= 9 && hour <= 17 && !isWeekend;

if (!isBusinessHours) {
  return totalOwners; // All signatures after hours
}
return 2; // Normal threshold during business
```

### 4. **Smart Contract Enforcement**

Implement custom threshold logic in Safe smart contract or custom guard:
- On-chain validation
- Cannot be bypassed
- More secure

**Trade-off:** Requires custom Safe deployment or guard contract.

---

## Testing Guide

### Test 1: Default Threshold

1. Create transaction with "Use Safe default"
2. Check success message shows Safe threshold
3. View in Pending Transactions
4. Should NOT show "(Custom)" badge

### Test 2: Custom Threshold (Lower)

⚠️ **Only if Safe default threshold = 1**

1. Create transaction with "1 of 3"
2. Check success message shows custom threshold
3. View in Pending Transactions
4. Should show "(Custom)" badge and warning
5. Execute with 1 signature

### Test 3: Custom Threshold (Higher)

1. Safe default: 2 of 3
2. Create transaction with "3 of 3"
3. Collect 2 signatures → Should NOT be executable
4. Collect 3rd signature → Should be executable
5. Execute successfully

### Test 4: Metadata Preservation

1. Create transaction with custom threshold
2. Sign as Owner A
3. Switch to Owner B
4. Check Pending Transactions shows custom threshold
5. Verify metadata persists

---

## Code Changes Summary

### Files Modified:

1. **src/components/ngo-transaction.tsx**
   - Added `requiredSignatures` state
   - Added dropdown UI for threshold selection
   - Store custom threshold in metadata
   - Updated success messages

2. **src/components/pending-transactions.tsx**
   - Extract custom threshold from `origin` metadata
   - Display custom threshold with badge
   - Show custom vs. default comparison
   - Validate execution against custom threshold

### Lines of Code:
- Added: ~80 lines
- Modified: ~30 lines
- Total: ~110 LOC

### Build Status: ✅ Passing

---

## Conclusion

Custom threshold per transaction provides:
- ✅ **Maximum flexibility** for transaction approvals
- ✅ **Better UX** with clear visual indicators
- ✅ **Risk-based security** (adapt to each transaction)
- ✅ **Easy to use** (simple dropdown selection)
- ✅ **Backward compatible** with existing Safe infrastructure

**Recommended for:** NGO wallets with varying transaction types and risk levels.

**Test thoroughly** before production use, especially interaction with Safe smart contract's default threshold validation.
