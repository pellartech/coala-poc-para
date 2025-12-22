import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { RPC_URL } from "@/config/network";

// Helper to convert hex to string
function hexToString(hex: string): string {
  try {
    return Buffer.from(hex.slice(2), 'hex').toString('utf-8');
  } catch {
    return hex;
  }
}

/**
 * Create Para EIP-1193 provider from wallet client and account
 */
export function createParaProvider(walletClient: any, viemAccount: any, rpcUrl: string = RPC_URL) {
  return createParaEip1193Provider(walletClient, viemAccount, rpcUrl);
}

/**
 * Get Safe SDK instance using Para or MetaMask provider
 * Safe Protocol Kit v6 accepts EIP-1193 provider directly
 */
export async function getSafeSdk({
  paraProvider,
  metamaskProvider,
  safeAddress,
  signerAddress,
}: {
  paraProvider?: any;
  metamaskProvider?: any;
  safeAddress: string;
  signerAddress: string;
}) {
  // Use whichever provider is provided
  const provider = paraProvider || metamaskProvider;
  
  if (!provider) {
    throw new Error("Either paraProvider or metamaskProvider must be provided");
  }
  
  // Safe Protocol Kit v6 accepts EIP-1193 provider directly
  return await Safe.init({
    provider: provider as any, // EIP-1193 provider
    signer: signerAddress as `0x${string}`, // Signer address
    safeAddress: safeAddress as `0x${string}`,
  });
}

/**
 * Create an EIP-1193 provider from Para wallet client
 */
export function createParaEip1193Provider(walletClient: any, viemAccount: any, rpcUrl: string = RPC_URL) {
  if (!walletClient || !viemAccount) {
    throw new Error("walletClient and viemAccount are required");
  }

  const provider = {
    request: async (args: { method: string; params?: any[] }) => {
      const { method, params } = args;
      
      try {

      // Intercept eth_accounts - return Para wallet address
      if (method === 'eth_accounts') {
        return [viemAccount.address];
      }

      // Intercept personal_sign calls and use Para wallet
      // personal_sign(message, address) - message is hex string, address is signer address
      if (method === 'personal_sign' || method === 'eth_sign') {
        if (!params || params.length < 2) {
          throw new Error('Invalid params for personal_sign');
        }

        // personal_sign format: [message (hex), address]
        const [message, address] = params;
        
        // Verify address matches
        if (address && address.toLowerCase() !== viemAccount.address.toLowerCase()) {
          throw new Error('Address mismatch');
        }

        // Convert hex message to string
        let messageToSign: string;
        if (typeof message === 'string' && message.startsWith('0x')) {
          // Hex string, decode to UTF-8
          try {
            const hexBytes = message.slice(2);
            messageToSign = Buffer.from(hexBytes, 'hex').toString('utf-8');
            // Remove null bytes if any
            messageToSign = messageToSign.replace(/\0/g, '');
          } catch (e) {
            // If conversion fails, use hex string directly
            console.warn('Failed to convert hex to string, using hex directly:', e);
            messageToSign = message;
          }
        } else {
          messageToSign = typeof message === 'string' ? message : String(message);
        }

        console.log('personal_sign called:', {
          originalMessage: message,
          convertedMessage: messageToSign,
          address: address || viemAccount.address,
        });

        // Use Para wallet to sign message
        // Para's signMessage handles Ethereum message prefix automatically
        const signature = await walletClient.signMessage({
          account: walletClient.account,
          message: messageToSign,
        });

        return signature;
      }

      // Intercept signTypedData calls and use Para wallet
      if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData') {
        if (!params || params.length < 2) {
          throw new Error('Invalid params for signTypedData');
        }

        const [address, typedData] = params;
        
        // Verify address matches
        if (address.toLowerCase() !== viemAccount.address.toLowerCase()) {
          throw new Error('Address mismatch');
        }

        // Parse typedData if it's a string
        const parsedTypedData = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;

        // Use Para wallet to sign
        const signature = await walletClient.signTypedData({
          account: walletClient.account,
          domain: parsedTypedData.domain,
          types: parsedTypedData.types,
          primaryType: parsedTypedData.primaryType,
          message: parsedTypedData.message,
        });

        return signature;
      }

      // Intercept eth_sendTransaction and use Para wallet
      if (method === 'eth_sendTransaction') {
        if (!params || params.length < 1) {
          throw new Error('Invalid params for sendTransaction');
        }

        const [tx] = params;
        
        // Use Para wallet to send transaction
        const hash = await walletClient.sendTransaction({
          account: walletClient.account,
          to: tx.to,
          value: tx.value ? BigInt(tx.value) : undefined,
          data: tx.data,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
        });

        return hash;
      }

      // For other methods, forward to RPC
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params: params || [],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RPC ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'RPC error');
      }
      return data.result;
      
      } catch (error: any) {
        console.error('EIP-1193 Provider Error:', method, error.message);
        throw error;
      }
    },
  };

  // Add additional properties that BrowserProvider might need
  // Make the provider look more like a standard EIP-1193 provider
  const enhancedProvider = Object.assign(provider, {
    isMetaMask: false,
    isConnected: () => true,
    // Add chainId and accounts for compatibility
    chainId: undefined,
    accounts: viemAccount?.address ? [viemAccount.address] : [],
    // Add event emitter methods that BrowserProvider might need
    on: (event: string, callback: (...args: any[]) => void) => {
      // No-op for now, but provides the method
      return enhancedProvider;
    },
    removeListener: (event: string, callback: (...args: any[]) => void) => {
      // No-op for now, but provides the method
      return enhancedProvider;
    },
    removeAllListeners: (event?: string) => {
      // No-op for now, but provides the method
      return enhancedProvider;
    },
  });

  return enhancedProvider;
}

/**
 * Add a new signer (Safe owner) using Para wallet
 * Following the pattern from Para docs: https://docs.getpara.com/v2/react/guides/web3-operations/evm/smart-accounts/manage-signers#safe
 */
export async function addSigner(
  protocolKit: Safe,
  newOwner: string,
  newThreshold?: number
) {
  try {
    const currentOwners = await protocolKit.getOwners();
    const currentThreshold = await protocolKit.getThreshold();
    
    console.log("Current owners:", currentOwners);
    console.log("Current threshold:", currentThreshold);
    
    const params = {
      ownerAddress: newOwner,
      threshold: newThreshold
    };
    
    const safeTransaction = await protocolKit.createAddOwnerTx(params);
    
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    await protocolKit.signTransaction(safeTransaction);
    
    console.log("Transaction hash:", safeTxHash);
    
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    
    console.log("Owner added:", txResponse.hash);
    console.log("New owner:", newOwner);
    
    return txResponse;
  } catch (error) {
    console.error("Failed to add owner:", error);
    throw error;
  }
}

/**
 * Remove a signer (Safe owner) using Para wallet
 * Following the pattern from Safe docs: https://docs.getpara.com/v2/react/guides/web3-operations/evm/smart-accounts/manage-signers#safe-3
 */
export async function removeSigner(
  protocolKit: Safe,
  ownerToRemove: string,
  newThreshold?: number
) {
  try {
    const currentOwners = await protocolKit.getOwners();
    const currentThreshold = await protocolKit.getThreshold();
    
    if (!currentOwners.includes(ownerToRemove)) {
      throw new Error("Owner not found");
    }
    
    const finalThreshold = newThreshold || Math.max(1, currentThreshold - 1);
    
    const params = {
      ownerAddress: ownerToRemove,
      threshold: finalThreshold
    };
    
    const safeTransaction = await protocolKit.createRemoveOwnerTx(params);
    
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    await protocolKit.signTransaction(safeTransaction);
    
    console.log("Transaction hash:", safeTxHash);
    
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    
    console.log("Owner removed:", ownerToRemove);
    console.log("New threshold:", finalThreshold);
    
    return txResponse;
  } catch (error) {
    console.error("Failed to remove owner:", error);
    throw error;
  }
}

/**
 * Update threshold using Para wallet
 * Following the pattern from Para docs: https://docs.getpara.com/v2/react/guides/web3-operations/evm/smart-accounts/manage-signers#safe
 */
export async function updateThreshold(
  protocolKit: Safe,
  newThreshold: number
) {
  try {
    const currentOwners = await protocolKit.getOwners();
    const currentThreshold = await protocolKit.getThreshold();
    
    if (newThreshold > currentOwners.length) {
      throw new Error("Threshold cannot exceed number of owners");
    }
    
    if (newThreshold < 1) {
      throw new Error("Threshold must be at least 1");
    }
    
    console.log("Current threshold:", currentThreshold);
    console.log("New threshold:", newThreshold);
    
    const safeTransaction = await protocolKit.createChangeThresholdTx(newThreshold);
    
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    await protocolKit.signTransaction(safeTransaction);
    
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    
    console.log("Threshold updated:", txResponse.hash);
    
    return txResponse;
  } catch (error) {
    console.error("Failed to update threshold:", error);
    throw error;
  }
}

/**
 * Replace signer (swap owner) using Para wallet
 * Following the pattern from Safe docs: https://docs.getpara.com/v2/react/guides/web3-operations/evm/smart-accounts/manage-signers#safe-3
 */
export async function replaceSigner(
  protocolKit: Safe,
  oldOwner: string,
  newOwner: string
) {
  try {
    const currentOwners = await protocolKit.getOwners();
    
    if (!currentOwners.includes(oldOwner)) {
      throw new Error("Old owner not found");
    }
    
    if (currentOwners.includes(newOwner)) {
      throw new Error("New owner already exists");
    }
    
    const params = {
      oldOwnerAddress: oldOwner,
      newOwnerAddress: newOwner
    };
    
    const safeTransaction = await protocolKit.createSwapOwnerTx(params);
    
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signTransaction(safeTransaction);
    
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    
    console.log("Owner swapped:", txResponse.hash);
    console.log("Old:", oldOwner);
    console.log("New:", newOwner);
    
    return txResponse;
  } catch (error) {
    console.error("Failed to swap owner:", error);
    throw error;
  }
}
