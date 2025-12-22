"use client";

import { useState } from "react";
import Safe from "@safe-global/protocol-kit";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { http, createPublicClient } from "viem";
import { createParaEip1193Provider } from "@/lib/safeHelpers";
import { useWalletContext } from "@/contexts/WalletContext";
import { CHAIN, RPC_URL } from "@/config/network";

export const useCreateSafeMultisig = () => {
  // Get wallet context to check if MetaMask is connected
  const { walletType, address: contextAddress, getProvider } = useWalletContext();
  
  // Para wallet hooks (only used when Para is connected)
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
    // Check if any wallet is connected
    if (!walletType || !contextAddress) {
      throw new Error("Please connect your wallet first");
    }

    // For Para: need viemAccount and walletClient
    if (walletType === "para" && (!viemAccount || !walletClient)) {
      throw new Error("Please connect your Para wallet first");
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
      // Get the appropriate provider based on wallet type
      let provider: any;
      let signerAddress: string;

      if (walletType === "metamask") {
        // Use MetaMask provider from context
        provider = getProvider();
        signerAddress = contextAddress;
        console.log("Creating Safe with MetaMask", { signerAddress, owners, threshold });
      } else {
        // Use Para provider
        if (!viemAccount || !walletClient) {
          throw new Error("Para wallet not properly initialized");
        }
        provider = createParaEip1193Provider(walletClient, viemAccount, RPC_URL);
        signerAddress = viemAccount.address;
        console.log("Creating Safe with Para", { signerAddress, owners, threshold });
      }

      if (!provider) {
        throw new Error(`No provider available for ${walletType} wallet`);
      }

      // Deploy Safe with specified owners and threshold
      // Using predictedSafe will create the Safe and deploy it
      const safeSdk = await Safe.init({
        provider: provider as any,
        signer: signerAddress as `0x${string}`,
        predictedSafe: {
          safeAccountConfig: {
            owners: owners.map(addr => addr as `0x${string}`),
            threshold,
          },
        },
      });

      // Get the predicted address first
      const predictedSafeAddress = await safeSdk.getAddress();
      console.log("Predicted Safe address:", predictedSafeAddress);

      // Check if Safe is already deployed
      const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http(RPC_URL),
      });
      
      const code = await publicClient.getBytecode({ address: predictedSafeAddress as `0x${string}` });
      
      if (!code || code === "0x") {
        // Safe is not deployed, deploy it now
        console.log("Deploying Safe contract...");
        
        try {
          // Create the Safe deployment transaction
          const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction();
          console.log("Deployment transaction created:", deploymentTransaction);
          
          // Send the deployment transaction using the provider
          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: signerAddress,
              to: deploymentTransaction.to,
              value: deploymentTransaction.value,
              data: deploymentTransaction.data,
            }],
          });
          
          console.log("Safe deployment transaction hash:", txHash);
          console.log(`Check transaction on Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);
          
          // Wait for deployment transaction to be mined using waitForTransactionReceipt
          console.log("Waiting for deployment transaction to be mined...");
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash as `0x${string}`,
            timeout: 60_000, // 60 seconds timeout
            confirmations: 1, // Wait for at least 1 confirmation
          });
          
          console.log("Transaction mined! Receipt:", receipt);
          
          // Verify deployment
          const verifyCode = await publicClient.getBytecode({ address: predictedSafeAddress as `0x${string}` });
          if (!verifyCode || verifyCode === "0x") {
            throw new Error(`Safe deployment verification failed. Transaction: ${txHash}. Please check on Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);
          }
          
          console.log("Safe deployed successfully!");
        } catch (deployError: any) {
          console.error("Deployment error:", deployError);
          
          // Check if it's a user rejection
          if (deployError?.code === 4001 || deployError?.message?.includes('User rejected')) {
            throw new Error('Transaction rejected by user');
          }
          
          // If error has transaction hash, include it in the error message
          const errorMsg = deployError?.message || 'Unknown error';
          throw new Error(`Failed to deploy Safe: ${errorMsg}`);
        }
      } else {
        console.log("Safe already deployed at this address");
      }

      setSafeAddress(predictedSafeAddress);
      
      return predictedSafeAddress;
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
