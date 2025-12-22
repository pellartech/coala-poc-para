"use client";

import { useState, useEffect } from "react";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { getAddress, isAddress, decodeFunctionData, formatUnits } from "viem";
import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { http } from "viem";
import { CHAIN, RPC_URL, SAFE_TX_SERVICE_URL, SAFE_API_KEY } from "@/config/network";
import { getSafeSdk, createParaProvider } from "@/lib/safeHelpers";
import { useSafeProtocolKit } from "@/hooks/useSafeProtocolKit";
import { useWalletContext } from "@/contexts/WalletContext";
import { 
  getPendingTransactions, 
  confirmTransaction as confirmTx,
  getTransaction as getTx,
  proposeTransaction 
} from "@/lib/safeTxService";

// Helper to get Etherscan URL
const getEtherscanTxUrl = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;

// Use Safe Transaction Service response type directly
type SafeTransaction = any; // Use Safe Transaction Service response as-is

export default function PendingTransactions({ safeAddress }: { safeAddress: string }) {
  const { 
    isConnected: contextIsConnected, 
    walletType, 
    address: contextAddress,
    getProvider,
    paraViemAccount,
    paraWalletClient,
  } = useWalletContext();
  const { safeSdk, isLoading, owners, threshold, signerAddress } = useSafeProtocolKit(safeAddress);
  
  // Use Para-specific hooks only for Para wallet
  const { data: wallet } = useWallet();
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;

  const [pendingTxs, setPendingTxs] = useState<SafeTransaction[]>([]);
  const [isSigning, setIsSigning] = useState<string | null>(null);
  const [isLoadingTxs, setIsLoadingTxs] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Load pending transactions ONLY from Safe Transaction Service
  const loadPendingTransactions = async () => {
    setIsLoadingTxs(true);
    setError("");
    
    try {
      console.log("🔍 Loading pending transactions for Safe:", safeAddress);
      
      // Use direct API call instead of SafeApiKit
      const pendingTxsResponse = await getPendingTransactions(safeAddress);
      
      console.log("📦 Raw response from Safe TX Service:", pendingTxsResponse);
      console.log("📊 Total transactions:", pendingTxsResponse?.count || 0);
      console.log("📋 Results length:", pendingTxsResponse?.results?.length || 0);
      
      // Use Safe Transaction Service response directly
      if (pendingTxsResponse && pendingTxsResponse.results) {
        // Filter to only show transactions that are not executed
        const pendingOnly = pendingTxsResponse.results.filter((tx: any) => !tx.isExecuted);
        console.log("✅ Pending (not executed) transactions:", pendingOnly.length);
        
        if (pendingOnly.length > 0) {
          console.log("📝 First pending tx:", {
            hash: pendingOnly[0].safeTxHash,
            to: pendingOnly[0].to,
            confirmations: pendingOnly[0].confirmations?.length || 0,
            isExecuted: pendingOnly[0].isExecuted,
          });
        }
        
        setPendingTxs(pendingOnly);
      } else {
        console.log("⚠️ No results in response");
        setPendingTxs([]);
      }
    } catch (err: any) {
      // Use error from Safe Transaction Service directly, no modification
      console.error("❌ Failed to load pending transactions:", err);
      setError(err?.message || err?.toString() || "Failed to load pending transactions");
      setPendingTxs([]);
    } finally {
      setIsLoadingTxs(false);
    }
  };

  useEffect(() => {
    if (safeAddress) {
      loadPendingTransactions();
    }
  }, [safeAddress]);

  const handleSignTransaction = async (tx: SafeTransaction) => {
    if (!contextIsConnected || !contextAddress) {
      setError("Please connect your wallet first");
      return;
    }

    // Check if current wallet is an owner
    const currentAddress = getAddress(contextAddress);
    if (!owners.includes(currentAddress)) {
      setError("Your current wallet is not an owner of this Safe");
      return;
    }

    // Check if already signed using Safe Transaction Service data directly
    const confirmations = tx.confirmations || [];
    const hasAlreadySigned = confirmations.some((conf: any) => 
      getAddress(conf.owner).toLowerCase() === currentAddress.toLowerCase()
    );
    
    if (hasAlreadySigned) {
      setError("You have already signed this transaction");
      return;
    }

    setIsSigning(tx.safeTxHash);
    setError("");
    setSuccess("");

    try {
      // Get provider and signer based on wallet type
      let provider: any;
      let signer: string;

      if (walletType === "metamask") {
        provider = getProvider();
        signer = contextAddress;
        console.log("Using MetaMask provider for signing");
      } else {
        // Para wallet
        if (!paraViemAccount || !paraWalletClient) {
          setError("Para wallet not properly initialized");
          return;
        }
        provider = createParaProvider(paraWalletClient, paraViemAccount, RPC_URL);
        signer = paraViemAccount.address;
        console.log("Using Para provider for signing");
      }
      
      // Get Safe SDK using appropriate provider
      const safeSdkLocal = await getSafeSdk({
        paraProvider: walletType === "para" ? provider : undefined,
        metamaskProvider: walletType === "metamask" ? provider : undefined,
        safeAddress,
        signerAddress: signer,
      });
      console.log("Signer address:", signer);
      console.log("Signing transaction hash:", tx.safeTxHash);

      // Get transaction data from Safe Transaction Service
      // Note: We'll recreate from tx data instead of fetching again
      const safeTransactionData = tx;
      
      // Recreate the Safe transaction from service data
      // Must include ALL parameters to get exact same hash
      const safeTransaction = await safeSdkLocal.createTransaction({
        transactions: [{
          to: safeTransactionData.to as `0x${string}`,
          value: safeTransactionData.value || "0",
          data: safeTransactionData.data as `0x${string}` || "0x",
        }],
      });
      
      // Set additional transaction parameters if they exist in service data
      if (safeTransactionData.safeTxGas) {
        safeTransaction.data.safeTxGas = safeTransactionData.safeTxGas;
      }
      if (safeTransactionData.baseGas) {
        safeTransaction.data.baseGas = safeTransactionData.baseGas;
      }
      if (safeTransactionData.gasPrice) {
        safeTransaction.data.gasPrice = safeTransactionData.gasPrice;
      }
      if (safeTransactionData.gasToken) {
        safeTransaction.data.gasToken = safeTransactionData.gasToken;
      }
      if (safeTransactionData.refundReceiver) {
        safeTransaction.data.refundReceiver = safeTransactionData.refundReceiver;
      }
      if (safeTransactionData.nonce !== undefined) {
        safeTransaction.data.nonce = safeTransactionData.nonce;
      }

      // Verify the transaction hash matches
      const recreatedHash = await safeSdkLocal.getTransactionHash(safeTransaction);
      console.log("Original hash:", tx.safeTxHash);
      console.log("Recreated hash:", recreatedHash);
      
      if (recreatedHash.toLowerCase() !== tx.safeTxHash.toLowerCase()) {
        console.error("⚠️ Transaction hash mismatch!");
        console.error("This means the recreated transaction doesn't match the original");
        console.error("Signature will recover wrong signer address!");
        throw new Error(
          `Transaction hash mismatch!\n` +
          `Original: ${tx.safeTxHash}\n` +
          `Recreated: ${recreatedHash}\n\n` +
          `This transaction was created with different parameters. ` +
          `Cannot sign - hash must match exactly.`
        );
      }
      console.log("✅ Hash match confirmed");

      // Sign transaction (following Para docs pattern)
      const signedTx = await safeSdkLocal.signTransaction(safeTransaction);
      console.log("Signed transaction:", signedTx);

      // Extract signature from signedTx
      const signaturesMap = signedTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          console.log("Found signature for address:", addr, "signature length:", sigValue.length);
          break;
        }
      }

      if (!signature) {
        throw new Error("Failed to extract signature from signed transaction");
      }

      console.log("Confirming with signer:", currentAddress);
      console.log("Signature:", signature.slice(0, 20) + "...");

      // Confirm transaction with extracted signature using direct API call
      await confirmTx(tx.safeTxHash, signature, currentAddress);
      
      setSuccess("Transaction confirmed! Reloading...");
      
      // Reload from Safe Transaction Service to get latest state
      await loadPendingTransactions();
    } catch (err: any) {
      // Use error from Safe Transaction Service directly
      console.error("Failed to confirm transaction:", err);
      setError(err?.message || err?.toString() || "Failed to confirm transaction");
    } finally {
      setIsSigning(null);
    }
  };

  const handleRejectTransaction = async (tx: SafeTransaction) => {
    if (!contextIsConnected || !contextAddress) {
      setError("Please connect your wallet first");
      return;
    }

    if (!confirm(
      `⚠️ Reject this transaction ON-CHAIN?\n\n` +
      `Transaction: ${tx.safeTxHash.slice(0, 10)}...\n` +
      `Nonce: ${tx.nonce}\n\n` +
      `This will create a rejection transaction with the same nonce.\n` +
      `Once executed, the original transaction cannot be executed anymore.\n\n` +
      `Continue?`
    )) {
      return;
    }

    setIsSigning(tx.safeTxHash);
    setError("");
    setSuccess("");

    try {
      console.log("Creating rejection transaction for nonce:", tx.nonce);

      // Get provider and signer based on wallet type
      let provider: any;
      let signer: string;

      if (walletType === "metamask") {
        provider = getProvider();
        signer = contextAddress;
      } else {
        // Para wallet
        if (!paraViemAccount || !paraWalletClient) {
          setError("Para wallet not properly initialized");
          return;
        }
        provider = createParaProvider(paraWalletClient, paraViemAccount, RPC_URL);
        signer = paraViemAccount.address;
      }

      // Get Safe SDK using appropriate provider
      const safeSdkLocal = await getSafeSdk({
        paraProvider: walletType === "para" ? provider : undefined,
        metamaskProvider: walletType === "metamask" ? provider : undefined,
        safeAddress,
        signerAddress: signer,
      });

      // Create rejection transaction: self-transfer with 0 value
      const rejectionTx = await safeSdkLocal.createRejectionTransaction(tx.nonce);
      console.log("Rejection transaction created with nonce:", tx.nonce);

      // Sign the rejection transaction
      const signedRejectionTx = await safeSdkLocal.signTransaction(rejectionTx);
      console.log("Rejection transaction signed");

      // Always propose rejection transaction to Safe TX Service (even if threshold = 1)
      // User needs to manually execute in Pending Transactions tab
      const rejectionTxHash = await safeSdkLocal.getTransactionHash(rejectionTx);
      
      // Extract signature
      const signaturesMap = signedRejectionTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          break;
        }
      }

      if (!signature) {
        throw new Error("Failed to extract signature from rejection transaction");
      }

      // Propose rejection transaction to Safe TX Service
      const sender = getAddress(signer);
      await proposeTransaction({
        safeAddress: safeAddress,
        to: safeAddress, // Self-transfer
        value: "0",
        data: "0x",
        operation: 0,
        safeTxGas: signedRejectionTx.data.safeTxGas,
        baseGas: signedRejectionTx.data.baseGas,
        gasPrice: signedRejectionTx.data.gasPrice,
        gasToken: signedRejectionTx.data.gasToken,
        refundReceiver: signedRejectionTx.data.refundReceiver,
        nonce: tx.nonce, // Same nonce as original!
        contractTransactionHash: rejectionTxHash,
        sender: sender,
        signature: signature,
        origin: JSON.stringify({
          app: "NGO Wallet Management",
          type: "rejection",
          rejectingTx: tx.safeTxHash,
        }),
      });

      console.log("Rejection transaction proposed to Safe TX Service");
      
      setSuccess(
        `✅ Rejection transaction proposed!\n\n` +
        `Nonce: ${tx.nonce}\n` +
        `Required signatures: ${threshold}\n` +
        `Current signatures: 1 / ${threshold}\n\n` +
        (threshold === 1 
          ? `Go to "Pending Transactions" tab and execute the rejection transaction to reject the original transaction on-chain.`
          : `Other signers need to sign the rejection transaction.\n` +
            `Once ${threshold} signatures collected, execute to reject original transaction on-chain.`)
      );

      // Reload pending transactions
      await loadPendingTransactions();
    } catch (err: any) {
      console.error("Failed to reject transaction:", err);
      setError(err?.message || err?.toString() || "Failed to reject transaction");
    } finally {
      setIsSigning(null);
    }
  };

  const handleExecuteTransaction = async (tx: SafeTransaction) => {
    if (!contextIsConnected || !contextAddress) {
      setError("Please connect your wallet first");
      return;
    }

    // Use Safe Transaction Service data directly
    const confirmations = tx.confirmations || [];
    if (confirmations.length < threshold) {
      setError(`Need ${threshold} signatures, but only have ${confirmations.length}`);
      return;
    }

    setIsSigning(tx.safeTxHash);
    setError("");
    setSuccess("");

    try {
      console.log("Executing transaction:", tx.safeTxHash);
      console.log("Confirmations:", confirmations.length, "Threshold:", threshold);
      
      // Get the full transaction data from Safe Transaction Service using custom helper
      const safeTransactionData = await getTx(tx.safeTxHash);
      
      // Get provider and signer based on wallet type
      let provider: any;
      let signer: string;

      if (walletType === "metamask") {
        provider = getProvider();
        signer = contextAddress;
      } else {
        // Para wallet
        if (!paraViemAccount || !paraWalletClient) {
          setError("Para wallet not properly initialized");
          return;
        }
        provider = createParaProvider(paraWalletClient, paraViemAccount, RPC_URL);
        signer = paraViemAccount.address;
      }
      console.log("Executor address:", signer);

      // Get Safe SDK using appropriate provider
      const safeSdkLocal = await getSafeSdk({
        paraProvider: walletType === "para" ? provider : undefined,
        metamaskProvider: walletType === "metamask" ? provider : undefined,
        safeAddress,
        signerAddress: signer,
      });

      // Check if this is a rejection transaction
      let isRejectionTx = false;
      try {
        const metadata = JSON.parse(safeTransactionData.origin || "{}");
        isRejectionTx = metadata.type === "rejection";
      } catch (e) {
        // Not metadata, ignore
      }

      // Recreate transaction from Safe Transaction Service data
      let safeTransaction;
      
      if (isRejectionTx) {
        // For rejection transactions, use createRejectionTransaction
        console.log("Recreating rejection transaction with nonce:", safeTransactionData.nonce);
        safeTransaction = await safeSdkLocal.createRejectionTransaction(safeTransactionData.nonce);
      } else {
        // For normal transactions, create from transaction data
        safeTransaction = await safeSdkLocal.createTransaction({
          transactions: [{
            to: safeTransactionData.to as `0x${string}`,
            value: safeTransactionData.value || "0",
            data: safeTransactionData.data as `0x${string}` || "0x",
          }],
        });
        
        // Set all transaction parameters from service data to match exact hash
        if (safeTransactionData.safeTxGas) {
          safeTransaction.data.safeTxGas = safeTransactionData.safeTxGas;
        }
        if (safeTransactionData.baseGas) {
          safeTransaction.data.baseGas = safeTransactionData.baseGas;
        }
        if (safeTransactionData.gasPrice) {
          safeTransaction.data.gasPrice = safeTransactionData.gasPrice;
        }
        if (safeTransactionData.gasToken) {
          safeTransaction.data.gasToken = safeTransactionData.gasToken;
        }
        if (safeTransactionData.refundReceiver) {
          safeTransaction.data.refundReceiver = safeTransactionData.refundReceiver;
        }
        if (safeTransactionData.nonce !== undefined) {
          safeTransaction.data.nonce = safeTransactionData.nonce;
        }
      }
      
      // Verify transaction hash matches
      const recreatedHash = await safeSdkLocal.getTransactionHash(safeTransaction);
      console.log("Original tx hash:", tx.safeTxHash);
      console.log("Recreated hash:", recreatedHash);
      
      if (recreatedHash.toLowerCase() !== tx.safeTxHash.toLowerCase()) {
        throw new Error(
          `Transaction hash mismatch!\n` +
          `Original: ${tx.safeTxHash}\n` +
          `Recreated: ${recreatedHash}\n\n` +
          `Cannot execute - signatures won't be valid for this hash.`
        );
      }
      console.log("✅ Hash verified - matches original");
      
      // Add all collected signatures to the transaction
      // Sort confirmations by owner address (Safe requires signatures in order)
      const sortedConfirmations = [...confirmations].sort((a, b) => {
        const addrA = getAddress(a.owner).toLowerCase();
        const addrB = getAddress(b.owner).toLowerCase();
        return addrA < addrB ? -1 : addrA > addrB ? 1 : 0;
      });
      
      console.log("Adding signatures from confirmations (sorted by owner address)...");
      for (const confirmation of sortedConfirmations) {
        const ownerAddress = getAddress(confirmation.owner);
        const signatureData = confirmation.signature;
        
        if (signatureData) {
          // Add signature to the transaction
          safeTransaction.addSignature({
            signer: ownerAddress,
            data: signatureData,
          } as any);
          console.log("Added signature from:", ownerAddress, "sig:", signatureData.slice(0, 20) + "...");
        }
      }
      
      console.log("Total signatures added:", safeTransaction.signatures?.size || 0);
      
      // Verify we have enough signatures
      if ((safeTransaction.signatures?.size || 0) < threshold) {
        throw new Error(
          `Not enough signatures added to transaction!\n` +
          `Added: ${safeTransaction.signatures?.size || 0}\n` +
          `Required: ${threshold}`
        );
      }
      console.log(`✅ Signature validation passed: ${safeTransaction.signatures?.size}/${threshold}`);
      
      // Execute transaction with all signatures
      const txResponse = await safeSdkLocal.executeTransaction(safeTransaction);
      
      console.log("Transaction executed:", txResponse.hash);
      
      setSuccess(`Transaction executed successfully!\nHash: ${txResponse.hash}`);
      
      // Reload from Safe Transaction Service to get latest state
      await loadPendingTransactions();
    } catch (err: any) {
      // Use error from Safe SDK/Safe Transaction Service directly
      console.error("Failed to execute transaction:", err);
      setError(err?.message || err?.toString() || "Failed to execute transaction");
    } finally {
      setIsSigning(null);
    }
  };

  if (!contextIsConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet to sign transactions
      </div>
    );
  }

  if (isLoading || isLoadingTxs) {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span>Loading pending transactions...</span>
        </div>
      </div>
    );
  }

  if (pendingTxs.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900/20 dark:text-gray-400">
          No pending transactions. Create a transaction first.
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>💡 Note:</strong> All data is fetched directly from Safe Transaction Service API, 
          not using localStorage. Data displayed is original from Safe, not modified.
        </div>
      </div>
    );
  }

  const currentAddress = contextAddress ? getAddress(contextAddress) : null;
  const isOwner = currentAddress && owners.includes(currentAddress);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Pending Transactions
        </h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Transactions waiting for signatures. Each owner needs to sign with their wallet.
          </p>
          <button
            onClick={loadPendingTransactions}
            disabled={isLoadingTxs}
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔄 Refresh
          </button>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>📝 How to sign transactions:</strong>
          <ol className="list-decimal list-inside mt-1 space-y-1">
            <li>Ensure you're connected with a wallet that is an owner of this Safe</li>
            <li>Click the <strong>"✍️ Sign Transaction"</strong> button below the transaction</li>
            <li>Confirm signing in the Para wallet popup</li>
            <li>Once enough signatures are collected, click <strong>"🚀 Execute Transaction"</strong> to execute</li>
          </ol>
        </div>
        {currentAddress && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Current wallet: {currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}
            {isOwner ? " ✅ (Owner)" : " ❌ (Not an owner)"}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {pendingTxs.map((tx) => {
          // Use Safe Transaction Service data directly - no transformation
          const confirmations = tx.confirmations || [];
          const confirmationsCount = confirmations.length;
          
          // Extract custom threshold and metadata from origin
          let customThreshold = threshold; // Default to Safe's threshold
          let metadata = null;
          let isRejection = false;
          let rejectingTxHash = null;
          
          if (tx.origin) {
            try {
              metadata = JSON.parse(tx.origin);
              if (metadata.requiredSignatures) {
                customThreshold = metadata.requiredSignatures;
              }
              if (metadata.type === "rejection") {
                isRejection = true;
                rejectingTxHash = metadata.rejectingTx;
              }
            } catch (e) {
              // Not JSON metadata, ignore
            }
          }
          
          // Check if current wallet has signed using Safe Transaction Service data
          const hasSigned = currentAddress 
            ? confirmations.some((conf: any) => 
                getAddress(conf.owner).toLowerCase() === currentAddress.toLowerCase()
              )
            : false;
          
          const canSign = isOwner && !hasSigned; // Can sign if owner and hasn't signed yet
          const canExecute = confirmationsCount >= customThreshold; // Use custom threshold if set

          // Decode transaction data to get token transfer details
          let decodedData: { recipient: string; amount: string } | null = null;
          if (tx.data && tx.data !== "0x") {
            try {
              const decoded = decodeFunctionData({
                abi: [
                  {
                    name: "transfer",
                    type: "function",
                    inputs: [
                      { name: "recipient", type: "address" },
                      { name: "amount", type: "uint256" }
                    ],
                    outputs: [{ name: "", type: "bool" }],
                    stateMutability: "nonpayable"
                  }
                ],
                data: tx.data as `0x${string}`,
              });
              
              if (decoded.functionName === "transfer" && decoded.args) {
                const [recipient, amount] = decoded.args as [string, bigint];
                decodedData = {
                  recipient,
                  amount: formatUnits(amount, 6), // USDC has 6 decimals
                };
              }
            } catch (e) {
              // Not an ERC20 transfer, ignore
              console.log("Could not decode transaction data:", e);
            }
          }

          return (
            <div
              key={tx.safeTxHash}
              className={`flex flex-col gap-3 p-4 border rounded-lg ${
                isRejection 
                  ? "border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-900/10" 
                  : "border-black/[.08] dark:border-white/[.145]"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {isRejection ? "🚫 Rejection Transaction" : "Transaction"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {confirmationsCount} / {customThreshold} signatures
                    {customThreshold !== threshold && <span className="ml-1 text-orange-600">(Custom)</span>}
                    {canExecute && " ✅"}
                  </span>
                </div>
                <div className="text-xs font-mono break-all space-y-1">
                  {isRejection && (
                    <div className="mb-2 p-2 bg-red-100 dark:bg-red-900/30 rounded">
                      <p className="text-red-800 dark:text-red-300 font-semibold">
                        ⚠️ This is a rejection transaction
                      </p>
                      <p className="text-red-700 dark:text-red-400 text-xs mt-1">
                        Execute this to permanently block transaction: {rejectingTxHash?.slice(0, 10)}...
                      </p>
                      <p className="text-red-700 dark:text-red-400 text-xs mt-1">
                        <strong>Nonce:</strong> {tx.nonce} (same as original)
                      </p>
                    </div>
                  )}
                  <p><strong>Safe Tx Hash:</strong> {tx.safeTxHash}</p>
                  {isRejection ? (
                    <>
                      <p><strong>Type:</strong> Rejection (Self-transfer with 0 value)</p>
                      <p><strong>To:</strong> {tx.to} (Safe itself)</p>
                      <p><strong>Value:</strong> 0 ETH</p>
                      <p><strong>Purpose:</strong> Consume nonce {tx.nonce} to block original transaction</p>
                    </>
                  ) : decodedData ? (
                    <>
                      <p><strong>Type:</strong> Token Transfer</p>
                      <p><strong>Amount:</strong> {decodedData.amount} {metadata?.token || "USDC"}</p>
                      <p><strong>Recipient:</strong> {decodedData.recipient}</p>
                      <p><strong>Token:</strong> {tx.to}</p>
                    </>
                  ) : (
                    <>
                      <p><strong>To:</strong> {tx.to}</p>
                      <p><strong>Value:</strong> {tx.value || "0"} ETH</p>
                    </>
                  )}
                  {customThreshold !== threshold && !isRejection && (
                    <p className="text-orange-600 dark:text-orange-400">
                      <strong>Custom Threshold:</strong> {customThreshold} signature{customThreshold > 1 ? 's' : ''} required (Safe default: {threshold})
                    </p>
                  )}
                  <p><strong>Nonce:</strong> {tx.nonce}</p>
                  <p><strong>Created:</strong> {tx.submissionDate ? new Date(tx.submissionDate).toLocaleString() : tx.created ? new Date(tx.created).toLocaleString() : "N/A"}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {canSign && (
                  <button
                    onClick={() => handleSignTransaction(tx)}
                    disabled={isSigning === tx.safeTxHash}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSigning === tx.safeTxHash ? "Signing..." : "✍️ Sign Transaction"}
                  </button>
                )}
                {hasSigned && (
                  <div className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm text-center">
                    ✅ You have signed
                  </div>
                )}
                {canExecute && (
                  <button
                    onClick={() => handleExecuteTransaction(tx)}
                    disabled={isSigning === tx.safeTxHash}
                    className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSigning === tx.safeTxHash ? "Executing..." : "🚀 Execute Transaction"}
                  </button>
                )}
                {/* {!isRejection && (
                  <button
                    onClick={() => handleRejectTransaction(tx)}
                    disabled={isSigning === tx.safeTxHash}
                    className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    title="Reject transaction on-chain"
                  >
                    ❌ Reject
                  </button>
                )} */}
              </div>

              {!isOwner && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  ⚠️ Switch to an owner wallet to sign this transaction
                </p>
              )}
              
              {isOwner && !canSign && !hasSigned && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  ℹ️ Connect with a different owner wallet to sign
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}
    </div>
  );
}
