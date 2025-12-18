"use client";

import { useState } from "react";
import Safe from "@safe-global/protocol-kit";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { http, createPublicClient } from "viem";
import { createParaEip1193Provider } from "@/lib/safeHelpers";
import { CHAIN, RPC_URL } from "@/config/network";

export const useCreateSafeMultisig = () => {
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

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);

  const createSafe = async (owners: string[], threshold: number) => {
    if (!viemAccount || !walletClient) {
      throw new Error("Please connect your wallet first");
    }

    if (owners.length < threshold) {
      throw new Error("Threshold cannot be greater than number of owners");
    }

    if (threshold < 1) {
      throw new Error("Threshold must be at least 1");
    }

    setIsCreating(true);
    setError(null);
    setSafeAddress(null);

    try {
      // Create custom EIP-1193 provider for Para wallet
      const paraProvider = createParaEip1193Provider(walletClient, viemAccount, RPC_URL);

      // Deploy Safe with specified owners and threshold
      // Using predictedSafe will create the Safe and deploy it
      const safeSdk = await Safe.init({
        provider: paraProvider as any,
        signer: viemAccount.address,
        predictedSafe: {
          safeAccountConfig: {
            owners: owners.map(addr => addr as `0x${string}`),
            threshold,
          },
        },
      });

      // Get the predicted address first
      const address = await safeSdk.getAddress();
      console.log("Predicted Safe address:", address);

      // Deploy the Safe contract
      // In Safe Protocol Kit v6, we need to deploy the Safe by creating a transaction
      // The Safe will be deployed automatically when the first transaction is executed
      try {
        // Check if Safe is already deployed
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });
        
        const code = await publicClient.getBytecode({ address: address as `0x${string}` });
        
        if (!code || code === "0x") {
          // Safe is not deployed, create a dummy transaction to deploy it
          console.log("Deploying Safe contract...");
          
          try {
            // Create a transaction to self (0 value) to trigger deployment
            const deployTx = await safeSdk.createTransaction({
              transactions: [{
                to: address as `0x${string}`,
                value: "0",
                data: "0x",
              }],
            });
            
            // Sign and execute the deployment transaction
            console.log("Signing deployment transaction...");
            await safeSdk.signTransaction(deployTx);
            
            console.log("Executing deployment transaction...");
            const deployResponse = await safeSdk.executeTransaction(deployTx);
            
            console.log("Safe deployed! Transaction hash:", deployResponse.hash);
            
            // Wait a bit for the transaction to be mined
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (signError: any) {
            // Extract detailed error information
            const errorDetails = {
              message: signError?.message || 'Unknown error',
              code: signError?.code,
              details: signError?.details,
              data: signError?.data,
              cause: signError?.cause,
            };
            
            console.error("Deployment error details:", errorDetails);
            
            // Throw the original error from API
            throw signError;
          }
        } else {
          console.log("Safe already deployed");
        }
      } catch (deployError: any) {
        console.error("Deployment error:", deployError);
        throw deployError;
      }

      setSafeAddress(address);
      
      return address;
    } catch (err: any) {
      console.error("Failed to create Safe:", err);
      const errorMessage = err?.message || "Failed to create Safe multisig wallet";
      setError(errorMessage);
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createSafe,
    isCreating,
    error,
    safeAddress,
  };
};
