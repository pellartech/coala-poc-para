"use client";

import { useEffect, useState } from "react";
import { useWalletContext } from "@/contexts/WalletContext";
import { useSafeWallets } from "@/hooks/useSafeWallets";
import { formatEther } from "viem";
import { createPublicClient, http } from "viem";
import { CHAIN, RPC_URL, getEtherscanAddressUrl } from "@/config/network";

interface SafeWalletWithBalance {
  address: string;
  balance: string;
}

export default function MySafeWallets() {
  const { isConnected, address } = useWalletContext();
  const { safeWallets, isLoading, error } = useSafeWallets();
  const [walletsWithBalance, setWalletsWithBalance] = useState<SafeWalletWithBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log("MySafeWallets - Debug:", {
      isConnected,
      address,
      safeWallets,
      isLoading,
      error,
    });
  }, [isConnected, address, safeWallets, isLoading, error]);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!safeWallets || safeWallets.length === 0) {
        setWalletsWithBalance([]);
        return;
      }

      setLoadingBalances(true);
      try {
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });

        const balancePromises = safeWallets.map(async (safeAddr) => {
          try {
            const balance = await publicClient.getBalance({
              address: safeAddr as `0x${string}`,
            });
            return {
              address: safeAddr,
              balance: formatEther(balance),
            };
          } catch (err) {
            console.error(`Failed to get balance for ${safeAddr}:`, err);
            return {
              address: safeAddr,
              balance: "0",
            };
          }
        });

        const results = await Promise.all(balancePromises);
        setWalletsWithBalance(results);
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      } finally {
        setLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [safeWallets]);

  // Don't render if no Safe wallets found (after loading)
  if (!isConnected && !isLoading && safeWallets.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Loading your Safe wallets...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ {error}
      </div>
    );
  }

  if (!safeWallets || safeWallets.length === 0) {
    return (
      <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-2">
            No Safe Wallets Found
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You don't have any Safe multisig wallets yet. Create one below!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-6 bg-gradient-to-br from-green-50/50 to-transparent dark:from-green-900/10">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
              My Safe Wallets
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Safe multisig wallets where you are an owner
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-xs font-medium text-green-700 dark:text-green-300">
            {safeWallets.length} {safeWallets.length === 1 ? 'Wallet' : 'Wallets'}
          </div>
        </div>

        {/* Wallets List */}
        <div className="flex flex-col gap-2">
          {loadingBalances ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              Loading balances...
            </div>
          ) : (
            walletsWithBalance.map((wallet, index) => (
              <div
                key={wallet.address}
                className="flex items-center justify-between p-4 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/30 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Safe #{index + 1}
                    </span>
                  </div>
                  <code className="text-xs font-mono text-black dark:text-zinc-50 break-all">
                    {wallet.address}
                  </code>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-black dark:text-zinc-50">
                      {parseFloat(wallet.balance).toFixed(4)} ETH
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Sepolia
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => navigator.clipboard.writeText(wallet.address)}
                      className="px-2 py-1 rounded border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06] text-xs"
                      title="Copy address"
                    >
                      📋
                    </button>
                    <a
                      href={getEtherscanAddressUrl(wallet.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06] text-xs"
                      title="View on Etherscan"
                    >
                      🔗
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Connected Address Info */}
        <div className="pt-3 border-t border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Connected as owner: </span>
            <code className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

