"use client";

import { useState, useEffect } from "react";
import { useSafeProtocolKit } from "@/hooks/useSafeProtocolKit";
import { useWalletContext } from "@/contexts/WalletContext";
import { isAddress, getAddress } from "viem";
import { addSigner, removeSigner, updateThreshold, replaceSigner } from "@/lib/safeHelpers";
import SafeApiKit from "@safe-global/api-kit";
import { CHAIN, SAFE_TX_SERVICE_URL, SAFE_API_KEY } from "@/config/network";
import { proposeTransaction } from "@/lib/safeTxService";

export default function SignerManager({ safeAddress }: { safeAddress: string }) {
  const { isConnected, walletType } = useWalletContext();
  const { safeSdk, isLoading, error, owners, threshold, refreshSafeInfo, signerAddress } = useSafeProtocolKit(safeAddress);
  
  const [newSignerAddress, setNewSignerAddress] = useState<string>("");
  const [signerToRemove, setSignerToRemove] = useState<string>("");
  const [newThreshold, setNewThreshold] = useState<number>(threshold);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  useEffect(() => {
    if (threshold > 0) {
      setNewThreshold(threshold);
    }
  }, [threshold]);

  const handleAddSigner = async () => {
    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    if (!newSignerAddress.trim() || !isAddress(newSignerAddress)) {
      setErrorMessage("Please enter a valid address");
      return;
    }

    const address = getAddress(newSignerAddress);
    
    if (owners.includes(address)) {
      setErrorMessage("This signer is already added");
      return;
    }

    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setIsProcessing(true);

    try {
      const currentOwners = await safeSdk.getOwners();
      const currentThreshold = await safeSdk.getThreshold();
      
      console.log("Adding signer with threshold:", currentThreshold);

      // Create transaction
      const params = {
        ownerAddress: address,
        threshold: newThreshold || threshold
      };
      
      const safeTransaction = await safeSdk.createAddOwnerTx(params);
      const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
      
      // Sign transaction
      const signedTx = await safeSdk.signTransaction(safeTransaction);
      
      // Always propose to Safe Transaction Service (even if threshold = 1)
      // User needs to manually execute in Pending Transactions tab
      
      // Extract signature
      const signaturesMap = signedTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          break;
        }
      }
      
      if (!signature) {
        throw new Error("Failed to extract signature");
      }
      
      const safeAddress = getAddress(await safeSdk.getAddress());
      const senderAddress = getAddress(signerAddress!); // Current connected owner who signed the transaction
      const nonce = await safeSdk.getNonce();
      
      // Propose transaction using direct API call
      await proposeTransaction({
        safeAddress: safeAddress,
        to: safeAddress, // Adding owner is a call to the Safe itself
        value: "0",
        data: signedTx.data.data,
        operation: signedTx.data.operation,
        safeTxGas: signedTx.data.safeTxGas,
        baseGas: signedTx.data.baseGas,
        gasPrice: signedTx.data.gasPrice,
        gasToken: signedTx.data.gasToken,
        refundReceiver: signedTx.data.refundReceiver,
        nonce: nonce,
        contractTransactionHash: safeTxHash,
        sender: senderAddress,
        signature: signature,
        origin: "NGO Wallet Management - Add Signer",
      });
      
      setSuccessMessage(
        `Add signer transaction created!\n\n` +
        `Current Threshold: ${currentThreshold} of ${currentOwners.length}\n` +
        `Current Signatures: 1 / ${currentThreshold}\n\n` +
        (currentThreshold === 1 
          ? `Go to "Pending Transactions" tab to execute this transaction.`
          : `Other owners need to sign this transaction in the "Pending Transactions" tab.`)
      );
      
      setNewSignerAddress("");
      await refreshSafeInfo();
    } catch (err: any) {
      console.error("Failed to add signer:", err);
      setErrorMessage(err?.message || "Failed to add signer");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveSigner = async () => {
    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    if (!signerToRemove || !isAddress(signerToRemove)) {
      setErrorMessage("Please select a signer to remove");
      return;
    }

    const address = getAddress(signerToRemove);

    if (!owners.includes(address)) {
      setErrorMessage("Signer not found in owners list");
      return;
    }

    if (owners.length === 1) {
      setErrorMessage("Cannot remove the last signer");
      return;
    }

    const finalThreshold = newThreshold || Math.max(1, threshold - 1);

    if (finalThreshold > owners.length - 1) {
      setErrorMessage(`Threshold cannot exceed number of remaining signers (max: ${owners.length - 1})`);
      return;
    }

    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setIsProcessing(true);

    try {
      const currentOwners = await safeSdk.getOwners();
      const currentThreshold = await safeSdk.getThreshold();
      
      console.log("Removing signer with threshold:", currentThreshold);

      // Create transaction
      const params = {
        ownerAddress: address,
        threshold: finalThreshold
      };
      
      const safeTransaction = await safeSdk.createRemoveOwnerTx(params);
      const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
      
      // Sign transaction
      const signedTx = await safeSdk.signTransaction(safeTransaction);
      
      // Always propose to Safe Transaction Service (even if threshold = 1)
      // User needs to manually execute in Pending Transactions tab
      
      // Extract signature
      const signaturesMap = signedTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          break;
        }
      }
      
      if (!signature) {
        throw new Error("Failed to extract signature");
      }
      
      const safeAddress = getAddress(await safeSdk.getAddress());
      const senderAddress = getAddress(signerAddress!); // Current connected owner who signed the transaction
      const nonce = await safeSdk.getNonce();
      
      // Propose transaction using direct API call
      await proposeTransaction({
        safeAddress: safeAddress,
        to: safeAddress,
        value: "0",
        data: signedTx.data.data,
        operation: signedTx.data.operation,
        safeTxGas: signedTx.data.safeTxGas,
        baseGas: signedTx.data.baseGas,
        gasPrice: signedTx.data.gasPrice,
        gasToken: signedTx.data.gasToken,
        refundReceiver: signedTx.data.refundReceiver,
        nonce: nonce,
        contractTransactionHash: safeTxHash,
        sender: senderAddress,
        signature: signature,
        origin: "NGO Wallet Management - Remove Signer",
      });
      
      setSuccessMessage(
        `Remove signer transaction created!\n\n` +
        `Current Threshold: ${currentThreshold} of ${currentOwners.length}\n` +
        `Current Signatures: 1 / ${currentThreshold}\n\n` +
        (currentThreshold === 1 
          ? `Go to "Pending Transactions" tab to execute this transaction.`
          : `Other owners need to sign this transaction in the "Pending Transactions" tab.`)
      );
      
      setSignerToRemove("");
      await refreshSafeInfo();
    } catch (err: any) {
      console.error("Failed to remove signer:", err);
      setErrorMessage(err?.message || "Failed to remove signer");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateThreshold = async () => {
    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    if (newThreshold < 1 || newThreshold > owners.length) {
      setErrorMessage(`Threshold must be between 1 and ${owners.length}`);
      return;
    }

    if (newThreshold === threshold) {
      setErrorMessage("Threshold is already set to this value");
      return;
    }

    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setIsProcessing(true);

    try {
      const currentOwners = await safeSdk.getOwners();
      const currentThreshold = await safeSdk.getThreshold();
      
      console.log("Updating threshold from", currentThreshold, "to", newThreshold);

      // Create transaction
      const safeTransaction = await safeSdk.createChangeThresholdTx(newThreshold);
      const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
      
      // Sign transaction
      const signedTx = await safeSdk.signTransaction(safeTransaction);
      
      // Always propose to Safe Transaction Service (even if threshold = 1)
      // User needs to manually execute in Pending Transactions tab
      
      // Extract signature
      const signaturesMap = signedTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          break;
        }
      }
      
      if (!signature) {
        throw new Error("Failed to extract signature");
      }
      
      const safeAddress = getAddress(await safeSdk.getAddress());
      const senderAddress = getAddress(signerAddress!); // Current connected owner who signed the transaction
      const nonce = await safeSdk.getNonce();
      
      // Propose transaction using direct API call
      await proposeTransaction({
        safeAddress: safeAddress,
        to: safeAddress,
        value: "0",
        data: signedTx.data.data,
        operation: signedTx.data.operation,
        safeTxGas: signedTx.data.safeTxGas,
        baseGas: signedTx.data.baseGas,
        gasPrice: signedTx.data.gasPrice,
        gasToken: signedTx.data.gasToken,
        refundReceiver: signedTx.data.refundReceiver,
        nonce: nonce,
        contractTransactionHash: safeTxHash,
        sender: senderAddress,
        signature: signature,
        origin: "NGO Wallet Management - Update Threshold",
      });
      
      setSuccessMessage(
        `Update threshold transaction created!\n\n` +
        `Current Threshold: ${currentThreshold} of ${currentOwners.length}\n` +
        `Current Signatures: 1 / ${currentThreshold}\n\n` +
        (currentThreshold === 1 
          ? `Go to "Pending Transactions" tab to execute this transaction.`
          : `Other owners need to sign this transaction in the "Pending Transactions" tab.`)
      );
      
      await refreshSafeInfo();
    } catch (err: any) {
      console.error("Failed to update threshold:", err);
      setErrorMessage(err?.message || "Failed to update threshold");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span>Loading Safe information...</span>
        </div>
      </div>
    );
  }

  if (error || !safeSdk) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error || "Failed to load Safe information"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Manage Signers
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Add or remove signers and update the threshold for your NGO wallet
        </p>
      </div>

      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="rounded-lg bg-green-50 p-2 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300 mb-3">
          <strong>💡 Owner = Signer:</strong> In Safe, "owner" and "signer" are the same concept. 
          Each owner has the right to sign transactions.
        </div>
        <div className="space-y-1">
          <p><strong>Current Signers (Owners):</strong> {owners.length}</p>
          <p><strong>Current Threshold:</strong> {threshold} of {owners.length}</p>
          <div className="mt-2">
            <p className="font-semibold mb-1">Signer/Owner Addresses:</p>
            <ul className="list-disc list-inside space-y-1">
              {owners.map((owner, index) => (
                <li key={index} className="font-mono text-xs break-all">
                  {index + 1}. {owner}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Add Signer */}
      <div className="flex flex-col gap-3 p-4 border border-black/[.08] dark:border-white/[.145] rounded-lg">
        <h3 className="text-lg font-semibold text-black dark:text-zinc-50">Add Signer</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          <strong>Owner = Signer:</strong> In Safe, every owner is a signer. 
          When adding a new owner, they will have the right to sign transactions.
          <br />
          <br />
          Signer/Owner is any Ethereum address (can be Para wallet, MetaMask, or any address).
          <br />
          <strong>⚠️ Note:</strong> To sign transactions, the signer must have a private key/wallet. 
          If you add an address without a wallet, they will not be able to sign.
          <br />
          <strong>✅ Best practice:</strong> Only add addresses of actual wallets (Para, MetaMask, Hardware wallet, etc.)
        </p>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>💡 What is the threshold for when adding a signer?</strong>
          <br />
          <br />
          <strong>This is the number of signatures REQUIRED to execute transactions AFTER adding the new signer.</strong>
          <br />
          <br />
          <strong>Specific example:</strong>
          <br />
          • Current: 2 signers, threshold = 2 → Need 2/2 (100%) to execute
          <br />
          • Add 1 signer → Have 3 signers
          <br />
          • Choose new threshold = 2 → Later need 2/3 (67%) to execute
          <br />
          • Choose new threshold = 3 → Later need 3/3 (100%) to execute
          <br />
          <br />
          <strong>→ This threshold determines the security level of the Safe wallet after adding a signer.</strong>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={newSignerAddress}
            onChange={(e) => setNewSignerAddress(e.target.value)}
            placeholder="0x... (Ethereum address - can be Para wallet or any address)"
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
          <input
            type="number"
            min={1}
            max={owners.length + 1}
            value={newThreshold}
            onChange={(e) => setNewThreshold(parseInt(e.target.value) || 1)}
            placeholder="New threshold"
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
          <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
            <p>
              <strong>New threshold after adding signer:</strong> {newThreshold} of {owners.length + 1}
            </p>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded text-xs">
              <p className="font-semibold mb-1">Current:</p>
              <p>• {owners.length} signers, threshold = {threshold}</p>
              <p>• Need {threshold}/{owners.length} signatures to execute</p>
              <p className="font-semibold mt-2 mb-1">After adding:</p>
              <p>• {owners.length + 1} signers, threshold = {newThreshold}</p>
              <p>• Need {newThreshold}/{owners.length + 1} signatures to execute</p>
            </div>
          </div>
        </div>
        <button
          onClick={handleAddSigner}
          disabled={isProcessing}
          className="flex h-10 w-full items-center justify-center rounded-full bg-foreground px-4 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isProcessing ? "Processing..." : "Add Signer"}
        </button>
      </div>

      {/* Remove Signer */}
      <div className="flex flex-col gap-3 p-4 border border-black/[.08] dark:border-white/[.145] rounded-lg">
        <h3 className="text-lg font-semibold text-black dark:text-zinc-50">Remove Signer</h3>
        <div className="flex flex-col gap-2">
          <select
            value={signerToRemove}
            onChange={(e) => setSignerToRemove(e.target.value)}
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          >
            <option value="">Select signer to remove</option>
            {owners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={Math.max(1, owners.length - 1)}
            value={newThreshold}
            onChange={(e) => setNewThreshold(parseInt(e.target.value) || 1)}
            placeholder="New threshold"
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            New threshold after removing (1-{Math.max(1, owners.length - 1)})
          </p>
        </div>
        <button
          onClick={handleRemoveSigner}
          disabled={isProcessing || !signerToRemove}
          className="flex h-10 w-full items-center justify-center rounded-full border border-red-300 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          {isProcessing ? "Processing..." : "Remove Signer"}
        </button>
      </div>

      {/* Update Threshold */}
      <div className="flex flex-col gap-3 p-4 border border-black/[.08] dark:border-white/[.145] rounded-lg">
        <h3 className="text-lg font-semibold text-black dark:text-zinc-50">Update Threshold</h3>
        <div className="flex flex-col gap-2">
          <input
            type="number"
            min={1}
            max={owners.length}
            value={newThreshold}
            onChange={(e) => setNewThreshold(parseInt(e.target.value) || 1)}
            placeholder="New threshold"
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Number of signers required (1-{owners.length})
          </p>
        </div>
        <button
          onClick={handleUpdateThreshold}
          disabled={isProcessing || newThreshold === threshold}
          className="flex h-10 w-full items-center justify-center rounded-full bg-foreground px-4 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isProcessing ? "Processing..." : "Update Threshold"}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
          {successMessage}
        </div>
      )}
    </div>
  );
}
