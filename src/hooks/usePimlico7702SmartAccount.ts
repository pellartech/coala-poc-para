"use client";

import { createPublicClient, http } from "viem";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { useState, useEffect, useMemo } from "react";
import { CHAIN, RPC_URL } from "@/config/network";

const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || 'YOUR_PIMLICO_API_KEY';
const PIMLICO_URL = `https://api.pimlico.io/v2/${CHAIN.id}/rpc?apikey=${PIMLICO_API_KEY}`;

/**
 * Hook to create EIP-7702 Smart Account with Pimlico for gasless transactions
 * 
 * ✅ EIP-7702: Upgrades Para wallet DIRECTLY
 * ✅ Tokens stay in Para wallet (same address)
 * ✅ FREE gas from Para wallet directly
 * ✅ No separate Smart Account address!
 * 
 * Per Para team: "If you want to sponsor gas directly from the EOA (Para Account) 
 * you want to use EIP-7702 which will upgrade the Para wallet."
 */
export const usePimlico7702SmartAccount = () => {
  const { data: wallet } = useWallet();
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;
  
  // Get Para's Viem account and client
  const { viemAccount, isLoading: accountLoading } = useViemAccount({
    address: evmWalletAddress,
  });
  
  const { viemClient: walletClient, isLoading: clientLoading } = useViemClient({
    address: evmWalletAddress,
    walletClientConfig: {
      chain: CHAIN,
      transport: http(RPC_URL),
    },
  });
  
  const [smartAccountClient, setSmartAccountClient] = useState<any>(null);
  const [smartAccount, setSmartAccount] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create PublicClient (useMemo for performance - Per Para example)
  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: CHAIN,
      transport: http(RPC_URL)
    });
  }, []); // No dependencies - static client

  // Create Pimlico Paymaster Client (useMemo - Per Para example)
  const pimlicoClient = useMemo(() => {
    if (!PIMLICO_API_KEY || PIMLICO_API_KEY === 'YOUR_PIMLICO_API_KEY') {
      return null;
    }
    
    return createPimlicoClient({
      transport: http(PIMLICO_URL),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7"
      }
    });
  }, [PIMLICO_API_KEY]); // Only recreate if API key changes

  useEffect(() => {
    const initializeClient = async () => {
      // Wait for Para wallet to be ready
      if (!viemAccount || accountLoading || !walletClient || clientLoading) {
        setIsLoading(false);
        return;
      }
      
      // Validate Pimlico client
      if (!pimlicoClient) {
        setError("Pimlico API key not configured. Add NEXT_PUBLIC_PIMLICO_API_KEY to .env.local");
        setIsLoading(false);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        console.log("🚀 Setting up EIP-7702 Smart Account (Upgrade Para wallet)...");
        console.log("Para Wallet (will be upgraded):", walletClient.account?.address);

        // Create EIP-7702 Simple Smart Account
        // This UPGRADES the Para wallet directly instead of creating a new address!
        const account = await to7702SimpleSmartAccount({
          client: publicClient,
          owner: walletClient.account,  // Para wallet will be upgraded
          // entryPoint: {
          //   address: entryPoint07Address,
          //   version: "0.7"
          // },
        });

        console.log("✅ EIP-7702 Smart Account created (Para wallet upgraded)!");
        console.log("📍 Account Address (SAME as Para wallet):", account.address);
        console.log("💡 Tokens stay in Para wallet - no need to transfer!");

        // Create Smart Account Client with Pimlico bundler and paymaster
        const client = createSmartAccountClient({
          account,
          chain: CHAIN,
          bundlerTransport: http(PIMLICO_URL),
          paymaster: pimlicoClient,  // Use memoized paymaster client
          userOperation: {
            estimateFeesPerGas: async () => {
              return (await pimlicoClient.getUserOperationGasPrice()).fast
            }
          }
        });

        console.log("✅ Smart Account Client ready!");
        console.log("🎉 Gasless transactions enabled via Pimlico (EIP-7702)!");
        console.log("🎉 Send FROM Para wallet with FREE gas!");

        setSmartAccount(account);
        setSmartAccountClient(client);
        setError(null);
      } catch (error: any) {
        console.error("❌ Failed to initialize EIP-7702 Smart Account:", error);
        setError(error?.message || "Failed to initialize EIP-7702 Smart Account");
        setSmartAccount(null);
        setSmartAccountClient(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeClient();
  }, [viemAccount, accountLoading, walletClient, clientLoading, publicClient, pimlicoClient]);

  return {
    smartAccountClient,
    smartAccount,
    isLoading,
    error,
    // Expose Para EOA for signing authorization (needed for first transaction)
    paraEOA: walletClient?.account,
    publicClient,
  };
};

