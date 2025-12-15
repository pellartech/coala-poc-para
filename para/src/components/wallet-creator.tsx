"use client";

import { useCreateWallet, useAccount } from "@getpara/react-sdk";

export default function WalletCreator() {
  const { createWalletAsync, isPending, error } = useCreateWallet();
  const { isConnected } = useAccount();

  const handleCreateMulti = async () => {
    try {
      // Create EVM wallet
      const evmResult = await createWalletAsync({ type: "EVM" });
      console.log("Created EVM wallet:", evmResult);

      // Create Solana wallet
      const solanaResult = await createWalletAsync({ type: "SOLANA" });
      console.log("Created Solana wallet:", solanaResult);

      // Para SDK automatically updates account/wallets information through React Query
    } catch (err) {
      console.error("create wallets failed", err);
    }
  };

  const handleCreateEVM = async () => {
    try {
      const result = await createWalletAsync({ type: "EVM" });
      console.log("Created EVM wallet:", result);
      // Para SDK automatically updates account/wallets information through React Query
    } catch (err) {
      console.error("create EVM wallet failed", err);
    }
  };

  const handleCreateSolana = async () => {
    try {
      const result = await createWalletAsync({ type: "SOLANA" });
      console.log("Created Solana wallet:", result);
      // Para SDK automatically updates account/wallets information through React Query
    } catch (err) {
      console.error("create Solana wallet failed", err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Create Wallet
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Create one or more wallets to start using the application
        </p>
        {!isConnected && (
          <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
            ⚠️ <strong>Important:</strong> You need to sign in before creating a wallet so the wallet is saved to your account. If you create a wallet without signing in, the wallet will be lost when you sign out.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={handleCreateMulti}
          disabled={isPending || !isConnected}
          className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc] sm:w-auto"
          title={!isConnected ? "Please sign in first" : ""}
        >
          {isPending ? "Creating…" : "Create EVM + Solana"}
        </button>

        <button
          onClick={handleCreateEVM}
          disabled={isPending || !isConnected}
          className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a] sm:w-auto"
          title={!isConnected ? "Please sign in first" : ""}
        >
          {isPending ? "Creating…" : "Create EVM Only"}
        </button>

        <button
          onClick={handleCreateSolana}
          disabled={isPending || !isConnected}
          className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a] sm:w-auto"
          title={!isConnected ? "Please sign in first" : ""}
        >
          {isPending ? "Creating…" : "Create Solana Only"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {String(error)}
        </div>
      )}
    </div>
  );
}

