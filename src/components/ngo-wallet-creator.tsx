"use client";

import { useState } from "react";
import { useCreateSafeMultisig } from "@/hooks/useCreateSafeMultisig";
import { useWalletContext } from "@/contexts/WalletContext";
import { isAddress, getAddress } from "viem";
import { getEtherscanAddressUrl } from "@/config/network";

export default function NGOWalletCreator({ onWalletCreated }: { onWalletCreated?: (address: string) => void }) {
  const { isConnected, walletType } = useWalletContext();
  const { createSafe, isCreating, error, safeAddress } = useCreateSafeMultisig();
  
  const [walletName, setWalletName] = useState<string>("");
  const [signers, setSigners] = useState<string[]>([""]);
  const [threshold, setThreshold] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleAddSigner = () => {
    setSigners([...signers, ""]);
  };

  const handleRemoveSigner = (index: number) => {
    if (signers.length > 1) {
      const newSigners = signers.filter((_, i) => i !== index);
      setSigners(newSigners);
      // Adjust threshold if needed
      if (threshold > newSigners.length) {
        setThreshold(newSigners.length);
      }
    }
  };

  const handleSignerChange = (index: number, value: string) => {
    const newSigners = [...signers];
    newSigners[index] = value;
    setSigners(newSigners);
  };

  const handleCreateWallet = async () => {
    setErrorMessage("");

    // Validation
    if (!walletName.trim()) {
      setErrorMessage("Please enter a wallet name");
      return;
    }

    // Filter out empty signers and validate addresses
    const validSigners = signers
      .map(s => s.trim())
      .filter(s => s !== "")
      .map(s => {
        if (!isAddress(s)) {
          throw new Error(`Invalid address: ${s}`);
        }
        return getAddress(s);
      });

    if (validSigners.length === 0) {
      setErrorMessage("Please add at least one signer");
      return;
    }

    if (threshold < 1 || threshold > validSigners.length) {
      setErrorMessage(`Threshold must be between 1 and ${validSigners.length}`);
      return;
    }

    try {
      const address = await createSafe(validSigners, threshold);
      if (address && onWalletCreated) {
        onWalletCreated(address);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to create wallet");
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet (Para or MetaMask) before creating an NGO wallet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Create NGO Wallet (Multisig)
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Create a multisig wallet for your NGO (e.g., NRC) with multiple signers. 
          Configure how many signers are required to approve transactions.
        </p>
      </div>

      {safeAddress ? (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
          <div className="font-semibold mb-2">✅ NGO Wallet Created Successfully!</div>
          <div className="space-y-2">
            <p>
              <strong>Wallet Name:</strong> {walletName}
            </p>
            <p>
              <strong>Safe Address:</strong>{" "}
              <span className="font-mono text-xs break-all">{safeAddress}</span>
            </p>
            <p>
              <strong>Signers:</strong> {signers.filter(s => s.trim() !== "").length}
            </p>
            <p>
              <strong>Threshold:</strong> {threshold} of {signers.filter(s => s.trim() !== "").length}
            </p>
            <a
              href={`${getEtherscanAddressUrl(safeAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600 dark:text-blue-400"
            >
              View on Etherscan
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Wallet Name (e.g., NRC)
              </label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="NRC"
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Signers (Addresses)
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                Signers are any Ethereum addresses (can be Para wallet, MetaMask, or any address).
                <br />
                <strong>⚠️ Note:</strong> To sign transactions, the signer must have a private key/wallet. 
                If you add an address without a wallet, they will not be able to sign.
                <br />
                <strong>✅ Best practice:</strong> Only add addresses of actual wallets (Para, MetaMask, Hardware wallet, etc.)
              </p>
              <div className="flex flex-col gap-2">
                {signers.map((signer, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={signer}
                      onChange={(e) => handleSignerChange(index, e.target.value)}
                      placeholder="0x..."
                      className="flex-1 rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
                    />
                    {signers.length > 1 && (
                      <button
                        onClick={() => handleRemoveSigner(index)}
                        className="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleAddSigner}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] text-sm"
              >
                + Add Signer
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Threshold (Required Signatures)
              </label>
              <input
                type="number"
                min={1}
                max={signers.filter(s => s.trim() !== "").length || 1}
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Number of signers required to approve transactions (1-{signers.filter(s => s.trim() !== "").length || 1})
              </p>
            </div>
          </div>

          <button
            onClick={handleCreateWallet}
            disabled={isCreating}
            className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isCreating ? "Creating Wallet..." : "Create NGO Wallet"}
          </button>

          {(error || errorMessage) && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-wrap">
              {error || errorMessage}
            </div>
          )}
        </>
      )}
    </div>
  );
}
