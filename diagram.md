# Transfer Ownership Marketplace

This section describes the end-to-end stablecoin payment flow for the transfer ownership marketplace.
The diagram and steps focus strictly on actual on-chain fund movements and custody, excluding off-chain
API triggers and UI interactions.

---

## Steps

- The Donor wallet adds the token configuration (org address, stablecoin address, amount).
- The Donor approves the required stablecoin amount on the stablecoin contract.
- Another Donor triggers the payment off-chain; the Admin wallet executes the transaction on the contract,
  and the stablecoin is transferred directly from the Donor wallet to the Org wallet.

---

## Diagram: Stablecoin Payment Flow

```mermaid
flowchart TB
    %% On-chain setup by Donor
    D[Donor Wallet] -->|addToken| C[Marketplace Contract]
    D -->|approve| T[Stablecoin Contract]

    %% Execution trigger
    A[Admin Wallet] -->|executorMint| C

    %% Actual payment transaction
    C -->|transferFrom Donor to Org| O[Org Wallet]
