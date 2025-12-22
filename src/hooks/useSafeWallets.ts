"use client";

import { useEffect, useState } from "react";
import { useWalletContext } from "@/contexts/WalletContext";
import { getSafesByOwner } from "@/lib/safeTxService";

export const useSafeWallets = () => {
  const { address, isConnected } = useWalletContext();
  const [safeWallets, setSafeWallets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSafeWallets = async () => {
      if (!address || !isConnected) {
        console.log("useSafeWallets - Not fetching:", { address, isConnected });
        setSafeWallets([]);
        return;
      }

      console.log("useSafeWallets - Fetching for address:", address);
      setIsLoading(true);
      setError(null);

      try {
        const safes = await getSafesByOwner(address);
        console.log("useSafeWallets - Fetched safes:", safes);
        setSafeWallets(safes);
      } catch (err: any) {
        console.error("useSafeWallets - Failed to fetch Safe wallets:", err);
        setError(err?.message || "Failed to fetch Safe wallets");
        setSafeWallets([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSafeWallets();
  }, [address, isConnected]);

  return {
    safeWallets,
    isLoading,
    error,
    refetch: async () => {
      if (!address || !isConnected) return;
      setIsLoading(true);
      try {
        const safes = await getSafesByOwner(address);
        setSafeWallets(safes);
      } catch (err: any) {
        console.error("Failed to fetch Safe wallets:", err);
        setError(err?.message || "Failed to fetch Safe wallets");
      } finally {
        setIsLoading(false);
      }
    },
  };
};

