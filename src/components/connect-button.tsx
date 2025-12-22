"use client";

import { useModal, useAccount, useWallet } from "@getpara/react-sdk";
import { useMetaMask } from "@/hooks/useMetaMask";
import { useEffect, useState } from "react";

type WalletType = "para" | "metamask" | null;

export function ConnectButton() {
  const { openModal } = useModal();
  const { data: wallet } = useWallet();
  const { isConnected: isParaConnected } = useAccount();
  const {
    isConnected: isMetaMaskConnected,
    address: metaMaskAddress,
    connect: connectMetaMask,
    disconnect: disconnectMetaMask,
    isInstalled: isMetaMaskInstalled,
  } = useMetaMask();
  const [mounted, setMounted] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [walletType, setWalletType] = useState<WalletType>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine current wallet type
  useEffect(() => {
    if (isParaConnected && wallet?.address) {
      setWalletType("para");
    } else if (isMetaMaskConnected && metaMaskAddress) {
      setWalletType("metamask");
    } else {
      setWalletType(null);
    }
  }, [isParaConnected, wallet?.address, isMetaMaskConnected, metaMaskAddress]);

  const handleConnectPara = () => {
    openModal();
    setShowWalletMenu(false);
  };

  const handleConnectMetaMask = async () => {
    try {
      await connectMetaMask();
      setShowWalletMenu(false);
    } catch (error) {
      console.error("Failed to connect MetaMask:", error);
    }
  };

  const handleDisconnect = () => {
    if (walletType === "metamask") {
      disconnectMetaMask();
    }
    // Para disconnect is handled by Para SDK
    setWalletType(null);
    setShowWalletMenu(false);
  };

  const getDisplayAddress = () => {
    if (walletType === "para" && wallet?.address) {
      return wallet.address;
    }
    if (walletType === "metamask" && metaMaskAddress) {
      return metaMaskAddress;
    }
    return null;
  };

  const displayAddress = getDisplayAddress();

  // Prevent hydration mismatch by showing consistent content on first render
  if (!mounted) {
    return (
      <button
        disabled
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto opacity-50"
      >
        Connect Wallet
      </button>
    );
  }

  if (displayAddress) {
    // Para wallet - click to open Para modal
    if (walletType === "para") {
      return (
        <button
          onClick={() => openModal()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto"
        >
          Para: {displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}
        </button>
      );
    }

    // MetaMask wallet - show disconnect menu
    return (
      <div className="relative">
        <button
          onClick={() => setShowWalletMenu(!showWalletMenu)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto"
        >
          MetaMask: {displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}
        </button>
        {showWalletMenu && (
          <div className="absolute right-0 top-14 z-50 min-w-[200px] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={handleDisconnect}
              className="w-full rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Disconnect
            </button>
          </div>
        )}
        {showWalletMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowWalletMenu(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowWalletMenu(!showWalletMenu)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto"
      >
        Connect Wallet
      </button>
      {showWalletMenu && (
        <div className="absolute right-0 top-14 z-50 min-w-[200px] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={handleConnectPara}
            className="w-full rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Connect Para (Email)
          </button>
          {isMetaMaskInstalled ? (
            <button
              onClick={handleConnectMetaMask}
              className="w-full rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Connect MetaMask
            </button>
          ) : (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Install MetaMask
            </a>
          )}
        </div>
      )}
      {showWalletMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowWalletMenu(false)}
        />
      )}
    </div>
  );
}

