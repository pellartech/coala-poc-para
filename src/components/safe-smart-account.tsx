"use client";

import { useSafeSmartAccount } from "@/hooks/useSafeSmartAccount";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useWalletContext } from "@/contexts/WalletContext";
import { useState, useEffect } from "react";
import { parseEther, getAddress, isAddress, formatEther, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN, RPC_URL, getEtherscanAddressUrl } from "@/config/network";

export default function SafeSmartAccount() {
  const { smartAccountClient, safeAccount, isLoading, error: hookError } = useSafeSmartAccount();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { walletType } = useWalletContext();
  
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toAddress, setToAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("0.001");
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Check Safe Account balance
  useEffect(() => {
    const checkBalance = async () => {
      if (!safeAccount?.address) {
        setBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const publicClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL)
        });
        const balanceWei = await publicClient.getBalance({ address: safeAccount.address as `0x${string}` });
        setBalance(formatEther(balanceWei));
      } catch (err) {
        console.error("Failed to fetch balance:", err);
        setBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    checkBalance();
    // Refresh balance every 5 seconds
    const interval = setInterval(checkBalance, 5000);
    return () => clearInterval(interval);
  }, [safeAccount?.address]);

  const handleSendTransaction = async () => {
    if (!smartAccountClient || !safeAccount) {
      setError("Smart account has not been initialized");
      return;
    }

    if (!toAddress || !isAddress(toAddress)) {
      setError("Please enter a valid address (0x...)");
      return;
    }

    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      const value = parseEther(amount);
      const checksummedAddress = getAddress(toAddress); // Checksum address

      console.log("Sending transaction:", {
        to: checksummedAddress,
        value: amount,
        safeAccount: safeAccount.address
      });

      // Send user operation through Safe smart account
      // This returns UserOperation hash, not transaction hash
      const userOpHash = await smartAccountClient.sendTransaction({
        to: checksummedAddress,
        value: value,
      });

      console.log("UserOperation hash:", userOpHash);

      // Show success message with UserOperation hash and instructions to check on Etherscan
      setSuccess(`Transaction submitted successfully!\nUserOperation Hash: ${userOpHash}\n\nCheck transaction status on Etherscan:\n${getEtherscanAddressUrl(safeAccount.address)}`);
    } catch (err: any) {
      console.error("Transaction error:", err);
      
      // Return original error message from Safe without modification
      let errorMessage = "Error sending transaction";
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.shortMessage) {
        errorMessage = err.shortMessage;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleGetAddress = () => {
    if (safeAccount) {
      const address = safeAccount.address;
      setSuccess(`Safe Account Address: ${address}`);
      console.log("Safe Account Address:", address);
    } else {
      setError("Safe account has not been initialized");
    }
  };

  // Hide this component when using MetaMask (this is Pimlico AA, not Safe multisig)
  if (walletType === "metamask") {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        ℹ️ <strong>MetaMask Connected:</strong> This section is for Pimlico Safe Smart Account (Account Abstraction with Para). With MetaMask, please use "NGO Wallet Management" below to create and manage Safe multisig wallets.
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet before using Safe Smart Account
      </div>
    );
  }

  // Check if EVM wallet exists
  const hasEVMWallet = wallet?.type === "EVM";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Safe Smart Account
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage and send transactions through Safe Smart Account with Account Abstraction
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
            <span>Initializing Safe Smart Account...</span>
          </div>
          <p className="mt-2 text-xs opacity-75">
            Make sure you have created an EVM wallet and configured Pimlico API key
          </p>
        </div>
      ) : !hasEVMWallet ? (
        <div className="rounded-lg bg-orange-50 p-4 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
          <div className="font-semibold mb-2">⚠️ No EVM Wallet</div>
          <p className="mt-2 text-xs">
            You need to create an EVM wallet before using Safe Smart Account.
            <br />Please scroll up to the "Create Wallet" section and click "Create EVM Only" or "Create EVM + Solana".
          </p>
        </div>
      ) : !safeAccount ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
          <div className="font-semibold mb-2">❌ Failed to initialize Safe Smart Account</div>
          {hookError ? (
            <div className="mt-2 text-xs whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900/30 p-2 rounded">
              {hookError}
            </div>
          ) : (
            <p className="mt-2 text-xs">
              Please check:
              <br />• Is Pimlico API key configured? (NEXT_PUBLIC_PIMLICO_API_KEY in .env.local)
              <br />• Have you restarted the dev server after adding the API key?
              <br />• Check console (F12) to see detailed errors
            </p>
          )}
          <div className="mt-3 text-xs space-y-1">
            <p><strong>Troubleshooting guide:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Check that <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">.env.local</code> file has <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">NEXT_PUBLIC_PIMLICO_API_KEY</code></li>
              <li>Get API key at: <a href="https://dashboard.pimlico.io" target="_blank" rel="noopener noreferrer" className="underline">https://dashboard.pimlico.io</a></li>
              <li>Restart dev server: <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">npm run dev</code></li>
              <li>Check console (F12) to see detailed errors</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Recipient Address (To Address)
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
                Amount (ETH)
              </label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.001"
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleGetAddress}
              disabled={!safeAccount}
              className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a] sm:w-auto"
            >
              Get Safe Account Address
            </button>

            <button
              onClick={handleSendTransaction}
              disabled={!smartAccountClient || isSending}
              className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc] sm:w-auto"
            >
              {isSending ? "Sending..." : "Send Transaction"}
            </button>
          </div>

          {safeAccount && (
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
              ✅ Safe Smart Account is ready
              <br />
              <span className="font-mono text-xs">
                Address: {safeAccount.address}
              </span>
              {balance !== null && (
                <>
                  <br />
                  <span className="text-xs">
                    💰 Balance: {parseFloat(balance).toFixed(6)} ETH
                    {isLoadingBalance && " (loading...)"}
                  </span>
                </>
              )}
              <div className="mt-2 rounded bg-blue-100 p-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                🎉 <strong>Gasless Transactions Enabled!</strong>
                <br />
                Transactions will be sponsored by Pimlico paymaster - no gas fees required!
                <br />
                <span className="text-xs opacity-75">
                  (Configure sponsorship policy at{" "}
                  <a 
                    href="https://dashboard.pimlico.io/sponsorship-policies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    dashboard.pimlico.io
                  </a>
                  )
                </span>
              </div>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
