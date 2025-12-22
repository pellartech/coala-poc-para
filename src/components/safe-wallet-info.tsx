"use client";

import { useEffect, useState } from "react";
import { useSafeProtocolKit } from "@/hooks/useSafeProtocolKit";
import { useWalletContext } from "@/contexts/WalletContext";
import { formatEther } from "viem";
import { createPublicClient, http } from "viem";
import { CHAIN, RPC_URL, getEtherscanAddressUrl } from "@/config/network";

interface SafeWalletInfoProps {
  safeAddress: string;
}

export default function SafeWalletInfo({ safeAddress }: SafeWalletInfoProps) {
  const { isConnected } = useWalletContext();
  const { safeSdk, isLoading: sdkLoading } = useSafeProtocolKit(safeAddress);
  
  const [owners, setOwners] = useState<string[]>([]);
  const [threshold, setThreshold] = useState<number>(0);
  const [balance, setBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadSafeInfo = async () => {
      if (!safeSdk || !isConnected) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError("");

        // Get Safe owners and threshold
        const [ownersList, thresholdValue] = await Promise.all([
          safeSdk.getOwners(),
          safeSdk.getThreshold(),
        ]);

        setOwners(ownersList);
        setThreshold(thresholdValue);

        // Get Safe balance
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });

        const balanceWei = await publicClient.getBalance({
          address: safeAddress as `0x${string}`,
        });

        setBalance(formatEther(balanceWei));
      } catch (err: any) {
        console.error("Failed to load Safe info:", err);
        setError(err?.message || "Failed to load Safe information");
      } finally {
        setIsLoading(false);
      }
    };

    loadSafeInfo();
  }, [safeSdk, safeAddress, isConnected]);

  if (!isConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet to view Safe information
      </div>
    );
  }

  if (isLoading || sdkLoading) {
    return (
      <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Loading Safe information...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
        ❌ {error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-6 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-900/10">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
              Safe Wallet
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Multisig wallet information
            </p>
          </div>
          <a
            href={getEtherscanAddressUrl(safeAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View on Etherscan →
          </a>
        </div>

        {/* Safe Address */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Safe Address
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-black/[.05] dark:bg-white/[.06] px-3 py-2 text-xs font-mono break-all">
              {safeAddress}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(safeAddress)}
              className="px-3 py-2 rounded-lg border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06] text-xs"
              title="Copy address"
            >
              📋
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Balance
          </label>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-black dark:text-zinc-50">
              {parseFloat(balance).toFixed(4)} ETH
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              (Sepolia)
            </span>
          </div>
        </div>

        {/* Multisig Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Owners
            </label>
            <span className="text-lg font-semibold text-black dark:text-zinc-50">
              {owners.length}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Threshold
            </label>
            <span className="text-lg font-semibold text-black dark:text-zinc-50">
              {threshold} of {owners.length}
            </span>
          </div>
        </div>

        {/* Owners List */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Owner Addresses
          </label>
          <div className="flex flex-col gap-1">
            {owners.map((owner, index) => (
              <div
                key={owner}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  #{index + 1}
                </span>
                <code className="flex-1 rounded bg-black/[.05] dark:bg-white/[.06] px-2 py-1 break-all">
                  {owner}
                </code>
              </div>
            ))}
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 pt-2 border-t border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              Active Safe Wallet
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

