"use client";

import { useState } from "react";
import NGOWalletCreator from "./ngo-wallet-creator";
import SignerManager from "./signer-manager";
import NGOTransaction from "./ngo-transaction";
import PendingTransactions from "./pending-transactions";
import SafeWalletInfo from "./safe-wallet-info";

export default function NGOWalletManager() {
  const [safeAddress, setSafeAddress] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"create" | "manage" | "transaction" | "pending">("create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
          NGO Wallet Management
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Create and manage multisig wallets for NGOs with policy-based transaction approvals.
          Example: NRC wallet with 3 signers, requiring 2 of 3 for payments.
        </p>
      </div>

      {/* Safe Wallet Info or Load Input */}
      {safeAddress ? (
        <div className="flex items-center gap-3">
          <SafeWalletInfo safeAddress={safeAddress} />
          <button
            onClick={() => {
              setSafeAddress("");
              setActiveTab("create");
            }}
            className="self-start px-4 py-2 rounded-lg border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06] text-sm"
            title="Clear and load another wallet"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4 border border-black/[.08] dark:border-white/[.145] rounded-lg">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            Load Existing Safe Wallet
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              onChange={(e) => {
                const addr = e.target.value;
                if (addr) {
                  setSafeAddress(addr);
                  setActiveTab("manage");
                }
              }}
              placeholder="0x... (Safe address)"
              className="flex-1 rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-black/[.08] dark:border-white/[.145]">
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "create"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
          }`}
        >
          Create Wallet
        </button>
        {safeAddress && (
          <>
            <button
              onClick={() => setActiveTab("manage")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "manage"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
              }`}
            >
              Manage Signers
            </button>
            <button
              onClick={() => setActiveTab("transaction")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "transaction"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
              }`}
            >
              Send Payment
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
              }`}
            >
              Pending Transactions
            </button>
          </>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "create" && (
          <NGOWalletCreator
            onWalletCreated={(address) => {
              if (address) {
                setSafeAddress(address);
                setActiveTab("manage");
              }
            }}
          />
        )}
        {activeTab === "manage" && safeAddress && (
          <SignerManager safeAddress={safeAddress} />
        )}
        {activeTab === "transaction" && safeAddress && (
          <NGOTransaction safeAddress={safeAddress} />
        )}
        {activeTab === "pending" && safeAddress && (
          <PendingTransactions safeAddress={safeAddress} />
        )}
      </div>
    </div>
  );
}
