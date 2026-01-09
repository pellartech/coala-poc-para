"use client";

import { useState } from "react";
import { isAddress, getAddress } from "viem";
import NGOWalletCreator from "./ngo-wallet-creator";
import SignerManager from "./signer-manager";
import NGOTransaction from "./ngo-transaction";
import PendingTransactions from "./pending-transactions";
import SafeWalletInfo from "./safe-wallet-info";

export default function NGOWalletManager() {
  const [safeAddress, setSafeAddress] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [inputError, setInputError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"create" | "manage" | "transaction" | "pending">("create");

  const handleLoadAddress = () => {
    const trimmedValue = inputValue.trim();
    
    if (!trimmedValue) {
      setInputError("Please enter a Safe address");
      return;
    }

    if (!isAddress(trimmedValue)) {
      setInputError("Invalid Ethereum address. Please enter a valid address starting with 0x");
      return;
    }

    try {
      // Normalize the address (checksum format)
      const normalizedAddress = getAddress(trimmedValue);
      setSafeAddress(normalizedAddress);
      setInputValue("");
      setInputError("");
      setActiveTab("manage");
    } catch (err) {
      setInputError("Invalid Ethereum address format");
    }
  };

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
              setInputValue("");
              setInputError("");
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
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  setInputValue(value);
                  setInputError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleLoadAddress();
                  }
                }}
                placeholder="0x... (Safe address)"
                className={`flex-1 rounded-lg border px-4 py-2 text-sm focus:outline-none dark:bg-[#1a1a1a] dark:text-zinc-50 ${
                  inputError
                    ? "border-red-500 focus:border-red-500 bg-white dark:border-red-500"
                    : "border-black/[.08] focus:border-blue-500 bg-white dark:border-white/[.145]"
                }`}
              />
              <button
                onClick={handleLoadAddress}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Load
              </button>
            </div>
            {inputError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {inputError}
              </p>
            )}
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
