"use client";

import { http, createPublicClient, type LocalAccount, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { useState, useEffect } from "react";

// Configuration constants - Replace with your values
const CHAIN = sepolia; // Target chain
// Use Alchemy or Infura RPC for better reliability
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"; // Your RPC endpoint
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || 'YOUR_PIMLICO_API_KEY'; // From dashboard.pimlico.io
const PIMLICO_URL = `https://api.pimlico.io/v2/${CHAIN.id}/rpc?apikey=${PIMLICO_API_KEY}`;

export const useSafeSmartAccount = () => {
  const { data: wallet } = useWallet();
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;
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
  const [safeAccount, setSafeAccount] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeClient = async () => {
      if (!viemAccount || accountLoading || !walletClient || clientLoading) {
        setIsLoading(false);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        // Validate viemAccount has address
        if (!viemAccount?.address) {
          throw new Error("Para account does not have an address. Please ensure you have created an EVM wallet.");
        }

        // Validate walletClient has account
        if (!walletClient.account?.address) {
          throw new Error("WalletClient does not have an account address. Please check your Para account.");
        }

        // Validate Pimlico API key
        if (!PIMLICO_API_KEY || PIMLICO_API_KEY === 'YOUR_PIMLICO_API_KEY') {
          throw new Error("Pimlico API key is not configured. Please add NEXT_PUBLIC_PIMLICO_API_KEY to .env.local");
        }

        console.log("Initializing Safe Smart Account with:", {
          accountAddress: viemAccount.address,
          chainId: CHAIN.id,
          accountType: viemAccount.type
        });

        console.log("ViemAccount details:", {
          address: viemAccount.address,
          type: viemAccount.type,
          hasSign: typeof (viemAccount as any).sign === 'function',
          hasSignMessage: typeof viemAccount.signMessage === 'function',
          hasSignTypedData: typeof viemAccount.signTypedData === 'function'
        });

        console.log("WalletClient from Para SDK:", {
          address: walletClient.account.address,
          type: walletClient.account.type,
          hasSign: typeof walletClient.account.sign === 'function',
          hasSignMessage: typeof walletClient.account.signMessage === 'function'
        });

        // Create Viem PublicClient (needed for smart account)
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL)
        });

        // ✅ IMPORTANT: Para wallet CANNOT sign EIP-712 in the format that Safe v1.4.1 requires
        // Para override/wrap signing → domain/types/primaryType are processed differently → Safe verify fails → AA24
        // Solution: Wrap Para signer into Safe-compatible account
        console.log("Creating Safe-compatible signer wrapper from Para wallet...");
        
        // Adjust v byte in signature: Safe expects 27/28, but Para may return 0/1
        function adjustV(signature: `0x${string}`): `0x${string}` {
          let sig = signature.slice(2);
          const vHex = sig.slice(-2);
          const v = parseInt(vHex, 16);
          if (!Number.isNaN(v) && v < 27) {
            const adjustedV = (v + 27).toString(16).padStart(2, "0");
            sig = sig.slice(0, -2) + adjustedV;
          }
          return `0x${sig}` as `0x${string}`;
        }
        
        // Create LocalAccount wrapper with properly wrapped signTypedData
        // Safe only calls signTypedData, not sign()
        const paraSafeOwner: LocalAccount = {
          address: walletClient.account.address,
          type: "local",
          // Get publicKey from walletClient.account if available
          publicKey: (walletClient.account as any).publicKey || `0x${'0'.repeat(130)}` as Hex,
          source: (walletClient.account as any).source || 'para',
          
          // Wrap signTypedData to ensure correct format for Safe
          // Safe requires signature of UserOperation hash in EIP-712 format with Safe domain
          async signTypedData(typedData: any) {
            console.log("🔐 Safe requesting signature with typedData:", {
              domain: typedData.domain,
              primaryType: typedData.primaryType,
              types: Object.keys(typedData.types || {}),
              messageKeys: Object.keys(typedData.message || {}),
            });
            
            try {
              const signature = await walletClient.signTypedData({
                account: walletClient.account,
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
              } as any);
              
              console.log("✅ Para wallet signed successfully");
              console.log("📝 Signature details (before adjustV):", {
                length: signature.length,
                prefix: signature.substring(0, 20) + "...",
                vByte: signature.slice(-2),
                fullSignature: signature,
                isValidLength: signature.length === 132,
              });
              
              // Adjust v byte for Safe compatibility (0/1 → 27/28)
              const adjustedSignature = adjustV(signature as `0x${string}`);
              console.log("📝 Signature details (after adjustV):", {
                length: adjustedSignature.length,
                prefix: adjustedSignature.substring(0, 20) + "...",
                vByte: adjustedSignature.slice(-2),
                fullSignature: adjustedSignature,
              });
              
              return adjustedSignature;
            } catch (error) {
              console.error("❌ Para wallet signTypedData failed:", error);
              throw error;
            }
          },
          
          // Wrap signMessage to ensure compatibility
          async signMessage({ message }: { message: any }) {
            const signature = await walletClient.signMessage({
              account: walletClient.account,
              message,
            });
            // Adjust v byte for Safe compatibility (0/1 → 27/28)
            return adjustV(signature as `0x${string}`);
          },
          
          // Add signTransaction to meet type requirements (Safe doesn't use it but it's required)
          async signTransaction(transaction: any) {
            return await walletClient.signTransaction({
              account: walletClient.account,
              ...transaction,
            });
          },
        };
        
        console.log("Creating Safe account with Safe-compatible signer wrapper...");
        
        const safe = await toSafeSmartAccount({
          client: publicClient,
          owners: [paraSafeOwner], // ✅ REQUIRED: Use wrapped account, do not use walletClient.account directly
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7"
          },
          version: "1.4.1",
          threshold: BigInt(1)
          // Optional: index for deterministic address
          // index: 0n
        });

        console.log("Safe account created:", {
          address: safe.address,
          ownerAddress: walletClient.account.address
        });

        // Create Pimlico client for bundler operations
        const pimlicoClient = createPimlicoClient({
          transport: http(PIMLICO_URL),
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7"
          }
        });

        // Create the Smart Account Client
        const client = createSmartAccountClient({
          account: safe,
          chain: CHAIN,
          bundlerTransport: http(PIMLICO_URL),
          // Temporarily disable paymaster for testing (users pay gas themselves)
          // To enable gasless, configure sponsorship policy at: https://dashboard.pimlico.io/sponsorship-policies
          // paymaster: pimlicoClient, // Uncomment when sponsorship policy is configured
          userOperation: {
            estimateFeesPerGas: async () => {
              return (await pimlicoClient.getUserOperationGasPrice()).fast
            }
          }
        });

        setSafeAccount(safe);
        setSmartAccountClient(client);
        setError(null);
      } catch (error: any) {
        console.error("Failed to initialize Safe client:", error);
        
        // Extract detailed error message
        let errorMessage = "Failed to initialize Safe Smart Account";
        
        if (error?.message) {
          errorMessage = error.message;
        } else if (error?.shortMessage) {
          errorMessage = error.shortMessage;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
        
        // Add more context based on error type
        if (errorMessage.includes('Pimlico API key') || errorMessage.includes('API key')) {
          errorMessage = "❌ Pimlico API key is not configured or invalid.\nPlease check NEXT_PUBLIC_PIMLICO_API_KEY in .env.local";
        } else if (errorMessage.includes('address is required') || errorMessage.includes('address')) {
          errorMessage = "❌ Invalid account address.\nPlease check:\n• Have you created an EVM wallet?\n• Does Para account have an address?\n• Have you logged in and connected your wallet?";
        } else if (errorMessage.includes('eth_accounts') || errorMessage.includes('MethodNotFound')) {
          errorMessage = "❌ Error connecting to Pimlico. Please check:\n• Is Pimlico API key correct?\n• Is the network stable?";
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          errorMessage = "❌ Network connection error. Please check:\n• Internet connection\n• Is RPC URL working?";
        }
        
        setError(errorMessage);
        setSafeAccount(null);
        setSmartAccountClient(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeClient();
  }, [viemAccount, accountLoading, walletClient, clientLoading]);

  return { smartAccountClient, safeAccount, isLoading: isLoading || accountLoading || clientLoading, error };
};
