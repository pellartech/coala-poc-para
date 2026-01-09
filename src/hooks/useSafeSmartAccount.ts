"use client";

import { http, createPublicClient, type LocalAccount, type Hex } from "viem";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWallet } from "@getpara/react-sdk";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { useState, useEffect, useMemo } from "react";
import { CHAIN, RPC_URL } from "@/config/network";
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

  // Create Pimlico Paymaster Client (useMemo for performance - similar to EIP-7702)
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

        // Validate Pimlico API key and client
        if (!PIMLICO_API_KEY || PIMLICO_API_KEY === 'YOUR_PIMLICO_API_KEY') {
          throw new Error("Pimlico API key is not configured. Please add NEXT_PUBLICO_API_KEY to .env.local");
        }
        
        if (!pimlicoClient) {
          throw new Error("Pimlico client not initialized. Please check your API key configuration.");
        }

        console.log("Initializing Safe Smart Account with:", {
          accountAddress: viemAccount.address,
          chainId: CHAIN.id,
          accountType: viemAccount.type
        });

        // Log detailed account information to help debug which accounts work vs don't work
        const accountInfo = {
          viemAccount: {
            address: viemAccount.address,
            type: viemAccount.type,
            hasSign: typeof (viemAccount as any).sign === 'function',
            hasSignMessage: typeof viemAccount.signMessage === 'function',
            hasSignTypedData: typeof viemAccount.signTypedData === 'function',
            isLocalAccount: (viemAccount as any).type === 'local',
            publicKey: (viemAccount as any).publicKey ? 'present' : 'missing',
            source: (viemAccount as any).source || 'unknown',
          },
          walletClientAccount: {
            address: walletClient.account.address,
            type: walletClient.account.type,
            hasSign: typeof walletClient.account.sign === 'function',
            hasSignMessage: typeof walletClient.account.signMessage === 'function',
            publicKey: (walletClient.account as any).publicKey ? 'present' : 'missing',
            source: (walletClient.account as any).source || 'unknown',
          },
          addressesMatch: viemAccount.address.toLowerCase() === walletClient.account.address.toLowerCase(),
        };
        
        console.log("📋 Account Analysis (for debugging account-specific issues):", accountInfo);
        
        // Warn if addresses don't match
        if (!accountInfo.addressesMatch) {
          console.warn("⚠️ Address mismatch between viemAccount and walletClient.account!");
        }

        // Create Viem PublicClient (needed for smart account)
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL)
        });

        // ✅ IMPORTANT: Safe Smart Account with Account Abstraction requires proper EIP-712 signing
        // Safe v1.4.1 with EntryPoint 0.7 requires signature of UserOperation hash in EIP-712 format
        // Different Para accounts may have different signing capabilities - handle all cases
        console.log("Creating Safe-compatible signer from Para wallet...");
        
        // Check account capabilities
        const hasViemSignTypedData = typeof (viemAccount as any)?.signTypedData === 'function';
        const isViemLocalAccount = (viemAccount as any).type === 'local';
        const viemCanUseDirectly = hasViemSignTypedData && isViemLocalAccount;
        
        console.log("🔍 Account Signing Capabilities:", {
          hasViemSignTypedData,
          isViemLocalAccount,
          viemCanUseDirectly,
          willUseWrapper: !viemCanUseDirectly,
        });
        
        // Normalize address to checksum format (important for some accounts)
        const normalizedAddress = walletClient.account.address as `0x${string}`;
        
        // Helper function to normalize signature format (outside object literal)
        const normalizeSignature = (signature: any, accountAddress: string): `0x${string}` => {
          if (typeof signature !== 'string') {
            throw new Error(`Invalid signature type for account ${accountAddress.slice(0, 10)}...`);
          }
          
          const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
          
          // Ensure signature is 130 hex chars (65 bytes)
          if (sigHex.length === 130) {
            return `0x${sigHex}` as `0x${string}`;
          } else if (sigHex.length === 128) {
            // Missing v byte, this shouldn't happen but handle it
            console.warn(`⚠️ [${accountAddress.slice(0, 10)}...] Signature missing v byte, adding default (27)`);
            return `0x${sigHex}1b` as `0x${string}`;
          } else {
            console.warn(`⚠️ [${accountAddress.slice(0, 10)}...] Unexpected signature length: ${sigHex.length}, using as-is`);
            return signature as `0x${string}`;
          }
        };
        
        // Create LocalAccount - try using viemAccount directly if compatible, otherwise wrap
        const paraSafeOwner: LocalAccount = viemCanUseDirectly
          ? (() => {
              console.log("✅ Using viemAccount directly (LocalAccount with signTypedData)");
              return viemAccount as LocalAccount;
            })()
          : {
              address: normalizedAddress,
              type: "local",
              publicKey: (walletClient.account as any).publicKey || (viemAccount as any).publicKey || `0x${'0'.repeat(130)}` as Hex,
              source: (walletClient.account as any).source || (viemAccount as any).source || 'para',
              
              // Wrap signTypedData to ensure correct format for Safe
              // Safe requires signature of UserOperation hash in EIP-712 format with Safe domain
              // This wrapper handles different account types and signing methods
              async signTypedData(typedData: any) {
                const accountAddress = normalizedAddress;
                console.log(`🔐 [Account: ${accountAddress.slice(0, 10)}...] Safe requesting signature:`, {
                  domain: typedData.domain,
                  primaryType: typedData.primaryType,
                  types: Object.keys(typedData.types || {}),
                  messageKeys: Object.keys(typedData.message || {}),
                });
                
                try {
                  // Strategy 1: Try viemAccount.signTypedData if available
                  if (hasViemSignTypedData && typeof (viemAccount as any).signTypedData === 'function') {
                    console.log(`📝 [${accountAddress.slice(0, 10)}...] Strategy 1: Using viemAccount.signTypedData`);
                    try {
                      const signature = await (viemAccount as any).signTypedData(typedData);
                      console.log(`✅ [${accountAddress.slice(0, 10)}...] viemAccount signed successfully`);
                      return normalizeSignature(signature, accountAddress);
                    } catch (err: any) {
                      console.warn(`⚠️ [${accountAddress.slice(0, 10)}...] viemAccount.signTypedData failed, trying fallback:`, err?.message);
                      // Continue to fallback
                    }
                  }
                  
                  // Strategy 2: Use walletClient.signTypedData (most common for Para accounts)
                  console.log(`📝 [${accountAddress.slice(0, 10)}...] Strategy 2: Using walletClient.signTypedData`);
                  const signature = await walletClient.signTypedData({
                    account: walletClient.account,
                    domain: typedData.domain,
                    types: typedData.types,
                    primaryType: typedData.primaryType,
                    message: typedData.message,
                  } as any);
                  
                  console.log(`✅ [${accountAddress.slice(0, 10)}...] Para wallet signed successfully`);
                  console.log(`📝 [${accountAddress.slice(0, 10)}...] Signature details:`, {
                    length: signature.length,
                    prefix: signature.substring(0, 20) + "...",
                    vByte: signature.slice(-2),
                    isValidLength: signature.length === 132 || signature.length === 130,
                  });
                  
                  return normalizeSignature(signature, accountAddress);
                } catch (error: any) {
                  console.error(`❌ [${accountAddress.slice(0, 10)}...] SignTypedData failed:`, error);
                  console.error(`❌ [${accountAddress.slice(0, 10)}...] Error details:`, {
                    message: error?.message,
                    accountType: viemAccount.type,
                    accountAddress: accountAddress,
                    hasViemSignTypedData,
                    typedDataDomain: typedData.domain,
                  });
                  throw new Error(`Failed to sign typed data for account ${accountAddress.slice(0, 10)}...: ${error?.message || 'Unknown error'}`);
                }
              },
              
              // Wrap signMessage to ensure compatibility
              async signMessage({ message }: { message: any }) {
                try {
                  if (hasViemSignTypedData && typeof (viemAccount as any).signMessage === 'function') {
                    return await (viemAccount as any).signMessage({ message });
                  }
                  const signature = await walletClient.signMessage({
                    account: walletClient.account,
                    message,
                  });
                  return signature as `0x${string}`;
                } catch (error: any) {
                  console.error("❌ SignMessage failed:", error);
                  throw new Error(`Failed to sign message: ${error?.message || 'Unknown error'}`);
                }
              },
              
              // Add signTransaction to meet type requirements
              async signTransaction(transaction: any) {
                try {
                  if (hasViemSignTypedData && typeof (viemAccount as any).signTransaction === 'function') {
                    return await (viemAccount as any).signTransaction(transaction);
                  }
                  return await walletClient.signTransaction({
                    account: walletClient.account,
                    ...transaction,
                  });
                } catch (error: any) {
                  console.error("❌ SignTransaction failed:", error);
                  throw new Error(`Failed to sign transaction: ${error?.message || 'Unknown error'}`);
                }
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

        // Create the Smart Account Client with Pimlico bundler and paymaster for FREE GAS
        const client = createSmartAccountClient({
          account: safe,
          chain: CHAIN,
          bundlerTransport: http(PIMLICO_URL),
          paymaster: pimlicoClient, // ✅ Enable gasless transactions via Pimlico paymaster
          userOperation: {
            estimateFeesPerGas: async () => {
              return (await pimlicoClient.getUserOperationGasPrice()).fast
            }
          }
        });

        console.log("✅ Smart Account Client ready!");
        console.log("🎉 Gasless transactions enabled via Pimlico paymaster!");
        console.log("🎉 Send transactions with FREE gas from Safe Smart Account!");

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
  }, [viemAccount, accountLoading, walletClient, clientLoading, pimlicoClient]);

  return { smartAccountClient, safeAccount, isLoading: isLoading || accountLoading || clientLoading, error };
};
