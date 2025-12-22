"use client";

import { useState, useEffect } from "react";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { isAddress, getAddress, formatUnits, parseUnits } from "viem";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import SafeApiKit from "@safe-global/api-kit";
import { CHAIN, RPC_URL, SAFE_TX_SERVICE_URL, SAFE_API_KEY, getEtherscanTxUrl } from "@/config/network";
import { getSafeSdk, createParaProvider } from "@/lib/safeHelpers";
import { useSafeProtocolKit } from "@/hooks/useSafeProtocolKit";
import { useWalletContext } from "@/contexts/WalletContext";
import { proposeTransaction } from "@/lib/safeTxService";

// USDC contract address on Sepolia (example - replace with actual)
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Replace with actual USDC address

// ERC20 Transfer ABI
const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
]);


export default function NGOTransaction({ safeAddress }: { safeAddress: string }) {
  const { 
    isConnected: contextIsConnected, 
    walletType,
    address: contextAddress,
    getProvider,
    paraViemAccount,
    paraWalletClient,
  } = useWalletContext();
  const { safeSdk, isLoading, error, owners, threshold, refreshSafeInfo, signerAddress } = useSafeProtocolKit(safeAddress);
  
  const [toAddress, setToAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [tokenAddress, setTokenAddress] = useState<string>(USDC_ADDRESS);
  const [requiredSignatures, setRequiredSignatures] = useState<number>(0); // Custom threshold per transaction
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [balance, setBalance] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState<number>(6);

  // Fetch token balance and decimals
  useEffect(() => {
    const fetchTokenInfo = async () => {
      if (!safeAddress || !tokenAddress) return;

      try {
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });

        const decimals = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "decimals",
        });

        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [safeAddress as `0x${string}`],
        });

        setTokenDecimals(Number(decimals));
        setBalance(formatUnits(balance, Number(decimals)));
      } catch (err) {
        console.error("Failed to fetch token info:", err);
      }
    };

    fetchTokenInfo();
  }, [safeAddress, tokenAddress]);


  const handleSendTransaction = async () => {
    if (!contextIsConnected) {
      setErrorMessage("Please connect your wallet (Para or MetaMask) first");
      return;
    }

    if (!safeSdk) {
      setErrorMessage("Safe SDK not initialized");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    // Validation
    if (!toAddress.trim() || !isAddress(toAddress)) {
      setErrorMessage("Please enter a valid recipient address");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }

    setIsSending(true);

    try {

      const recipient = getAddress(toAddress);
      const amountWei = parseUnits(amount, tokenDecimals);

      // Encode ERC20 transfer function
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [recipient, amountWei],
      });

      if (!signerAddress) {
        throw new Error("No signer address available");
      }
      
      const sender = getAddress(signerAddress); // Checksum address
      console.log("Sender address:", sender);
      console.log(`Safe threshold: ${threshold} of ${owners.length}`);

      // 1. Create transaction
      const safeTransaction = await safeSdk.createTransaction({
        transactions: [{
          to: tokenAddress as `0x${string}`,
          value: "0",
          data: data,
        }],
      });

      // 2. Get transaction hash
      const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
      console.log("Transaction hash:", safeTxHash);
      
      // 3. Sign transaction (following Para docs pattern)
      const signedTx = await safeSdk.signTransaction(safeTransaction);
      console.log("Signed transaction, signatures count:", signedTx.signatures?.size || 0);

      // Determine the effective threshold for this transaction
      const effectiveThreshold = requiredSignatures || threshold;
      console.log(`Using threshold: ${effectiveThreshold} (custom: ${requiredSignatures}, safe default: ${threshold})`);

      // Always propose to Safe Transaction Service (even if threshold = 1)
      // User needs to manually execute in Pending Transactions tab
      
      // Extract signature from signedTx
      const signaturesMap = signedTx.signatures || new Map();
      
      // Get signature for current signer
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          console.log("Found signature for address:", addr, "length:", sigValue.length);
          break;
        }
      }
      
      if (!signature) {
        throw new Error("Failed to extract signature from signed transaction");
      }
      
      // Get nonce from Safe
      const nonce = await safeSdk.getNonce();
      
      // Store custom threshold in origin field as metadata
      const metadata = {
        app: "NGO Wallet Management",
        requiredSignatures: effectiveThreshold,
        amount: amount,
        token: "USDC"
      };
      
      console.log("Proposing with custom threshold:", effectiveThreshold, "metadata:", metadata);
      
      // Propose transaction using direct API call to v1 endpoint
      await proposeTransaction({
        safeAddress: safeAddress,
        to: tokenAddress,
        value: "0",
        data: data,
        operation: 0, // CALL
        safeTxGas: signedTx.data.safeTxGas,
        baseGas: signedTx.data.baseGas,
        gasPrice: signedTx.data.gasPrice,
        gasToken: signedTx.data.gasToken,
        refundReceiver: signedTx.data.refundReceiver,
        nonce: nonce,
        contractTransactionHash: safeTxHash,
        sender: sender,
        signature: signature,
        origin: JSON.stringify(metadata), // Store as JSON string
      });
      
      console.log("Transaction proposed to Safe Transaction Service successfully");

      setSuccessMessage(
        `Transaction created!\n` +
        `Amount: ${amount} USDC\n` +
        `Required Signatures: ${effectiveThreshold} of ${owners.length}` + 
        (effectiveThreshold !== threshold ? ` (Custom threshold, Safe default is ${threshold})` : '') + `\n` +
        `Current Signatures: 1 / ${effectiveThreshold}\n` +
        `Safe Tx Hash: ${safeTxHash}\n\n` +
        (effectiveThreshold === 1 
          ? `Go to "Pending Transactions" tab to execute this transaction.`
          : `Other signers need to:\n` +
            `1. Connect with their owner wallet\n` +
            `2. Go to "Pending Transactions" tab\n` +
            `3. Sign this transaction\n\n` +
            `When ${effectiveThreshold} signatures are collected, you can execute the transaction.`)
      );
      
      // Clear form
      setToAddress("");
      setAmount("");
    } catch (err: any) {
      console.error("Failed to send transaction:", err);
      const errorMsg = err?.message || err?.error?.message || (typeof err === 'string' ? err : "Failed to send transaction");
      setErrorMessage(errorMsg);
    } finally {
      setIsSending(false);
    }
  };

  if (!contextIsConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet (Para or MetaMask)
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
          Send Payment
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Send USDC payments from Safe wallet. Transaction requires {threshold} of {owners.length} signatures to execute.
        </p>
      </div>

      {/* Safe Info */}
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="space-y-1">
          <p><strong>Current Threshold:</strong> {threshold} of {owners.length}</p>
          {amount && !isNaN(parseFloat(amount)) && (
            <p><strong>Transaction Amount:</strong> {amount} USDC</p>
          )}
          {balance !== null && (
            <p><strong>Balance:</strong> {parseFloat(balance).toFixed(2)} USDC</p>
          )}
        </div>
      </div>

      {/* Transaction Form */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black dark:text-zinc-50">
            Token Address (USDC)
          </label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black dark:text-zinc-50">
            Recipient Address
          </label>
          <input
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black dark:text-zinc-50">
            Amount (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black dark:text-zinc-50">
            Required Signatures
            <span className="text-xs text-zinc-500 ml-2">(Custom threshold for this transaction)</span>
          </label>
          <select
            value={requiredSignatures || threshold}
            onChange={(e) => setRequiredSignatures(parseInt(e.target.value))}
            className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
          >
            <option value={0}>Use Safe default ({threshold} of {owners.length})</option>
            {Array.from({ length: owners.length }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num}>
                {num} of {owners.length} signature{num > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          {requiredSignatures > 0 && requiredSignatures !== threshold && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              ⚠️ Custom threshold: This transaction requires {requiredSignatures} signature{requiredSignatures > 1 ? 's' : ''} (differs from Safe's default {threshold})
            </p>
          )}
          {(!requiredSignatures || requiredSignatures === threshold) && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Using Safe's default threshold: {threshold} of {owners.length} signatures
            </p>
          )}
        </div>
      </div>

      <button
        onClick={handleSendTransaction}
        disabled={isSending || !toAddress || !amount}
        className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isSending ? "Sending..." : "Send Payment"}
      </button>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-wrap">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400 whitespace-pre-wrap">
          {successMessage}
        </div>
      )}
    </div>
  );
}
