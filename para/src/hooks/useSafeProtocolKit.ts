"use client";

import { useState, useEffect } from "react";
import Safe from "@safe-global/protocol-kit";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { http, createPublicClient } from "viem";
import { createParaEip1193Provider } from "@/lib/safeHelpers";
import { CHAIN, RPC_URL } from "@/config/network";

export const useSafeProtocolKit = (safeAddress?: string) => {
  const { data: wallet } = useWallet();
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;
  const { viemAccount } = useViemAccount({
    address: evmWalletAddress,
  });
  const { viemClient: walletClient } = useViemClient({
    address: evmWalletAddress,
    walletClientConfig: {
      chain: CHAIN,
      transport: http(RPC_URL),
    },
  });

  const [safeSdk, setSafeSdk] = useState<Safe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [owners, setOwners] = useState<string[]>([]);
  const [threshold, setThreshold] = useState<number>(0);

  useEffect(() => {
    const initializeSafe = async () => {
      if (!safeAddress || !viemAccount || !walletClient) {
        setIsLoading(false);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // First, check if Safe contract is deployed by checking code at address
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });
        
        const code = await publicClient.getBytecode({ address: safeAddress as `0x${string}` });
        
        if (!code || code === "0x") {
          setError(`Safe contract not deployed at ${safeAddress}`);
          setSafeSdk(null);
          setIsLoading(false);
          return;
        }

        // Create custom EIP-1193 provider that intercepts signTypedData and eth_accounts calls
        const paraProvider = createParaEip1193Provider(walletClient, viemAccount, RPC_URL);

        // Initialize Safe with custom EIP-1193 provider
        // Safe.init will create SafeProvider internally
        const safe = await Safe.init({
          provider: paraProvider as any,
          signer: viemAccount.address,
          safeAddress: safeAddress as `0x${string}`,
        });

        const safeOwners = await safe.getOwners();
        const safeThreshold = await safe.getThreshold();

        setSafeSdk(safe);
        setOwners(safeOwners);
        setThreshold(Number(safeThreshold));
        setError(null);
      } catch (err: any) {
        console.error("Failed to initialize Safe Protocol Kit:", err);
        setError(err?.message || "Failed to initialize Safe");
        setSafeSdk(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSafe();
  }, [safeAddress, viemAccount, walletClient]);

  const refreshSafeInfo = async () => {
    if (!safeSdk) return;

    try {
      const safeOwners = await safeSdk.getOwners();
      const safeThreshold = await safeSdk.getThreshold();
      setOwners(safeOwners);
      setThreshold(Number(safeThreshold));
    } catch (err) {
      console.error("Failed to refresh Safe info:", err);
    }
  };

  return {
    safeSdk,
    isLoading,
    error,
    owners,
    threshold,
    refreshSafeInfo,
    signerAddress: viemAccount?.address,
  };
};
